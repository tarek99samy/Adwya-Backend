import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus, RefundStatus, StockMovementType } from '../common/enums';
import type { CreateRefundDto } from './dto/create-refund.dto';
import type { RefundFilterDto } from './dto/refund-filter.dto';
import type { DecideRefundDto } from './dto/decide-refund.dto';
import { round2 } from '../cart/cart.service';
import { OrderNotFoundException } from '../common/exceptions/commerce.exceptions';
import {
  IllegalRefundTransitionException,
  OrderNotRefundableException,
  RefundExceedsPaidAmountException,
  RefundNotFoundException,
} from '../common/exceptions/payments.exceptions';

/**
 * PENDING -> APPROVED -> COMPLETED, or PENDING -> REJECTED.
 * COMPLETED and REJECTED are terminal.
 */
const REFUND_TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = {
  [RefundStatus.PENDING]: [RefundStatus.APPROVED, RefundStatus.REJECTED],
  [RefundStatus.APPROVED]: [RefundStatus.COMPLETED, RefundStatus.REJECTED],
  [RefundStatus.COMPLETED]: [],
  [RefundStatus.REJECTED]: [],
};

/**
 * Statuses where the order is still live and holding reserved stock, so
 * completing a refund has to hand it back.
 *
 * CANCELLED and REJECTED are deliberately NOT here. Reaching either already
 * restored the stock - `shouldRestoreStock` in the order state machine on a
 * cancellation, and `PrescriptionsService.review` on a rejection - so
 * restoring again on the refund would credit the branch twice for the same
 * units and permanently inflate its inventory.
 *
 * DELIVERED is not here either: the customer has the goods.
 */
const STOCK_RETURNABLE: readonly OrderStatus[] = [
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Admin raises a refund against an order, optionally naming the specific
   * `PaymentTransaction` being reversed (domain-notes.md section 5 — refunds
   * reference an attempt, not just the order, so a provider can reconcile it).
   *
   * Creating a refund does not move money or stock; that happens on COMPLETED.
   */
  async create(adminId: string, dto: CreateRefundDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payment: true, refunds: true },
    });
    if (!order) throw new OrderNotFoundException();
    if (!order.payment) throw new OrderNotRefundableException('it has no payment record');

    if (
      order.payment.status !== PaymentStatus.PAID &&
      order.payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new OrderNotRefundableException(
        `the payment is ${order.payment.status}, not PAID`,
      );
    }

    // Everything already refunded or in flight counts against the ceiling.
    const paidAmount = Number(order.payment.amount);
    const committed = order.refunds
      .filter((r) => r.status !== RefundStatus.REJECTED)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const refundable = round2(paidAmount - committed);

    // Cheap pre-check so the common rejection does not pay for a serializable
    // transaction. It is not the guard - the re-sum below is.
    if (dto.amount <= 0 || dto.amount > refundable) {
      throw new RefundExceedsPaidAmountException(dto.amount, refundable);
    }

    if (dto.paymentTransactionId) {
      const attempt = await this.prisma.paymentTransaction.findFirst({
        where: { id: dto.paymentTransactionId, paymentId: order.payment.id },
      });
      if (!attempt) {
        throw new OrderNotRefundableException(
          'the named payment transaction does not belong to this order',
        );
      }
    }

    try {
      /*
       * Insert first, then re-sum inside the transaction and roll back if the
       * total went over. The pre-check above reads outside any transaction, so
       * two admins refunding the same order concurrently would both see the
       * same headroom and both pass it.
       *
       * Serializable is what makes the re-sum trustworthy: under the default
       * READ COMMITTED a concurrent uncommitted refund is invisible to the
       * aggregate, so both transactions would still commit. Refunds are rare
       * and admin-driven, so the isolation cost is irrelevant here.
       */
      return await this.prisma.$transaction(
        async (tx) => {
          const refund = await tx.refund.create({
            data: {
              orderId: order.id,
              paymentTransactionId: dto.paymentTransactionId ?? null,
              amount: dto.amount,
              reason: dto.reason,
              status: RefundStatus.PENDING,
              processedById: adminId,
            },
          });

          const { _sum } = await tx.refund.aggregate({
            where: { orderId: order.id, status: { not: RefundStatus.REJECTED } },
            _sum: { amount: true },
          });

          if (round2(Number(_sum.amount ?? 0)) > paidAmount) {
            throw new RefundExceedsPaidAmountException(dto.amount, refundable);
          }

          return refund;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      // Postgres aborted us to preserve serializability - another refund for
      // this order committed first. Surface it as a retryable conflict rather
      // than a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictException(
          'Another refund for this order was being raised at the same time. Please retry.',
        );
      }
      throw err;
    }
  }

  /**
   * Moves a refund through its state machine.
   *
   * On COMPLETED: marks the payment REFUNDED or PARTIALLY_REFUNDED, and
   * restores stock when the order never reached the customer. Money movement
   * itself is out-of-band until a live gateway exists — the ledger here is
   * what reconciliation is done against.
   */
  async decide(adminId: string, refundId: string, dto: DecideRefundDto) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { order: { include: { items: true, payment: true, refunds: true } } },
    });
    if (!refund) throw new RefundNotFoundException();

    if (!REFUND_TRANSITIONS[refund.status].includes(dto.status)) {
      throw new IllegalRefundTransitionException(refund.status, dto.status);
    }

    const order = refund.order;
    const completing = dto.status === RefundStatus.COMPLETED;
    const restoreStock = completing && STOCK_RETURNABLE.includes(order.status);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.refund.update({
        where: { id: refundId },
        data: {
          status: dto.status,
          reason: dto.reason ?? refund.reason,
          processedById: adminId,
        },
      });

      if (!completing) return updated;

      // Total refunded once this one lands.
      const refundedTotal = order.refunds
        .filter((r) => r.id !== refundId && r.status === RefundStatus.COMPLETED)
        .reduce((sum, r) => sum + Number(r.amount), 0) + Number(refund.amount);

      const fullyRefunded = round2(refundedTotal) >= Number(order.payment?.amount ?? 0);
      const paymentStatus = fullyRefunded
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;

      if (order.payment) {
        await tx.payment.update({ where: { id: order.payment.id }, data: { status: paymentStatus } });
      }
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus } });

      if (restoreStock) {
        for (const item of order.items) {
          await tx.branchInventory.updateMany({
            where: { branchId: order.branchId, medicineId: item.medicineId },
            data: { quantityAvailable: { increment: item.quantity } },
          });
        }
        await tx.stockMovement.createMany({
          data: order.items.map((item) => ({
            medicineId: item.medicineId,
            movementType: StockMovementType.RETURN,
            quantity: item.quantity,
            referenceType: 'REFUND',
            referenceId: refundId,
            reason: 'Refund completed',
            performedById: adminId,
          })),
        });
      }

      this.logger.log(
        `Refund ${refundId} completed for order ${order.orderNumber} (${paymentStatus})`,
      );
      return updated;
    });
  }

  async findAll(filter: RefundFilterDto) {
    const { page = 1, limit = 20 } = filter;

    const where: Prisma.RefundWhereInput = {
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { id: true, orderNumber: true, total: true } } },
      }),
      this.prisma.refund.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async findOne(id: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, orderNumber: true, total: true, status: true } },
        paymentTransaction: true,
      },
    });
    if (!refund) throw new RefundNotFoundException();
    return refund;
  }
}
