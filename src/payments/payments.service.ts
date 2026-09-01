import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '../common/enums';
import { round2 } from '../cart/cart.service';
import { PaymentProvider } from './payment-provider';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { SubmitInstapayReferenceDto } from './dto/submit-instapay-reference.dto';
import {
  NotBranchStaffException,
  OrderNotFoundException,
} from '../common/exceptions/commerce.exceptions';
import {
  DuplicateInstapayReferenceException,
  PaymentAlreadySettledException,
  PaymentNotFoundException,
  PaymentNotPendingException,
  UnsupportedPaymentFlowException,
} from '../common/exceptions/payments.exceptions';

/** Settled at the door by the courier, so they never get a gateway intent. */
const PAY_ON_DELIVERY_CODES = ['CASH', 'VISA_ON_DELIVERY'];
/** Customer transfers manually and submits a reference for staff to confirm. */
const MANUAL_TRANSFER_CODES = ['INSTAPAY'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
  ) {}

  // -------------------------------------------------------------------------
  // Intent (gateway-backed methods only)
  // -------------------------------------------------------------------------

  /**
   * Starts a gateway payment and returns the redirect the client should open.
   *
   * CASH and VISA_ON_DELIVERY are rejected — they are settled on delivery and
   * have no intent. INSTAPAY is rejected too: it is a manual bank transfer in
   * this product, handled by `submitInstapayReference` below.
   */
  async createIntent(userId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { payment: true, paymentMethod: true, customer: true },
    });

    if (!order || order.customerId !== userId) throw new OrderNotFoundException();
    if (!order.payment) throw new PaymentNotFoundException();

    const code = order.paymentMethod.code;
    if (PAY_ON_DELIVERY_CODES.includes(code)) {
      throw new UnsupportedPaymentFlowException(
        `${code} is settled on delivery and does not need a payment intent.`,
      );
    }
    if (MANUAL_TRANSFER_CODES.includes(code)) {
      throw new UnsupportedPaymentFlowException(
        'InstaPay is a manual transfer. Submit the transfer reference instead.',
      );
    }
    if (order.payment.status === PaymentStatus.PAID) {
      throw new PaymentAlreadySettledException();
    }

    const intent = await this.provider.createIntent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.total),
      customerPhone: order.customer.phone,
    });

    // Each attempt gets its own PaymentTransaction row; the provider id is the
    // unique key the webhook later reconciles against.
    await this.prisma.paymentTransaction.create({
      data: {
        paymentId: order.payment.id,
        providerTransactionId: intent.providerTransactionId,
        status: PaymentStatus.PENDING,
        rawResponse: { redirectUrl: intent.redirectUrl, expiresAt: intent.expiresAt.toISOString() },
      },
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.total),
      provider: this.provider.name,
      providerTransactionId: intent.providerTransactionId,
      redirectUrl: intent.redirectUrl,
      expiresAt: intent.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Provider callback handler.
   *
   * Three rules from domain-notes.md section 5, in order:
   *   1. Log the raw payload to PaymentWebhook **regardless of validity** — it
   *      is the forensic record, and a rejected payload is exactly what you
   *      want to look at later.
   *   2. Verify the signature. An invalid one is stored and then dropped.
   *   3. Be idempotent. `providerTransactionId` is unique, so a replayed
   *      webhook finds the existing settled transaction and no-ops.
   *
   * Always resolves 200-shaped: providers retry aggressively on non-2xx, and a
   * malformed payload is not something a retry will fix.
   */
  async handleWebhook(payload: Record<string, unknown>, signature?: string) {
    const verdict = this.provider.verifyWebhook(payload, signature);

    const webhook = await this.prisma.paymentWebhook.create({
      data: {
        provider: this.provider.name,
        payload: payload as Prisma.InputJsonValue,
        signatureValid: verdict.signatureValid,
      },
    });

    if (!verdict.signatureValid) {
      this.logger.warn(`Rejected webhook ${webhook.id}: bad signature`);
      return { received: true, processed: false, reason: 'INVALID_SIGNATURE' };
    }
    if (!verdict.providerTransactionId || !verdict.outcome) {
      await this.markProcessed(webhook.id);
      this.logger.warn(`Webhook ${webhook.id} carried no usable transaction reference`);
      return { received: true, processed: false, reason: 'UNRECOGNISED_PAYLOAD' };
    }

    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { providerTransactionId: verdict.providerTransactionId },
      include: { payment: true },
    });

    if (!transaction) {
      await this.markProcessed(webhook.id);
      return { received: true, processed: false, reason: 'UNKNOWN_TRANSACTION' };
    }

    // Idempotency: a settled transaction is terminal. A replay changes nothing.
    if (transaction.status !== PaymentStatus.PENDING) {
      await this.markProcessed(webhook.id);
      this.logger.log(`Webhook ${webhook.id} replayed a already-settled transaction; ignored`);
      return { received: true, processed: false, reason: 'ALREADY_PROCESSED' };
    }

    const paid = verdict.outcome === 'PAID';

    /*
     * A PAID callback has to be for the amount actually owed.
     *
     * The signature covers the amount, so a mismatch is not a forgery - it is a
     * partial capture, a currency/unit mistake, or the gateway reconciling
     * against the wrong order. Settling in full on it would write off the
     * difference silently. Park it as unprocessed so the raw payload is on
     * record and a human decides.
     *
     * FAILED callbacks skip this: a failure carries no money, and refusing to
     * record it would leave the transaction PENDING forever.
     */
    if (paid && verdict.amount !== undefined) {
      const owed = Number(transaction.payment.amount);
      if (round2(verdict.amount) !== round2(owed)) {
        await this.markProcessed(webhook.id);
        this.logger.error(
          `Webhook ${webhook.id} claims ${verdict.amount} for transaction ` +
            `${verdict.providerTransactionId} but ${owed} is owed; not settling.`,
        );
        return {
          received: true,
          processed: false,
          reason: 'AMOUNT_MISMATCH',
          expected: owed,
          received_amount: verdict.amount,
        };
      }
    }

    const nextStatus = paid ? PaymentStatus.PAID : PaymentStatus.FAILED;

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: nextStatus, rawResponse: payload as Prisma.InputJsonValue },
      });
      await tx.payment.update({
        where: { id: transaction.paymentId },
        data: { status: nextStatus },
      });
      await tx.order.update({
        where: { id: transaction.payment.orderId },
        data: { paymentStatus: nextStatus },
      });
      await tx.paymentWebhook.update({
        where: { id: webhook.id },
        data: { processedAt: new Date() },
      });
    });

    return { received: true, processed: true, outcome: verdict.outcome };
  }

  // -------------------------------------------------------------------------
  // InstaPay (manual bank transfer)
  // -------------------------------------------------------------------------

  /**
   * Customer submits the reference number of a transfer they already made.
   * This does NOT settle the payment — it records a PENDING transaction for
   * branch staff to confirm against their bank statement.
   */
  async submitInstapayReference(
    userId: string,
    orderId: string,
    dto: SubmitInstapayReferenceDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, paymentMethod: true },
    });

    if (!order || order.customerId !== userId) throw new OrderNotFoundException();
    if (!order.payment) throw new PaymentNotFoundException();
    if (!MANUAL_TRANSFER_CODES.includes(order.paymentMethod.code)) {
      throw new UnsupportedPaymentFlowException(
        'This order is not paying by InstaPay.',
      );
    }
    if (order.payment.status === PaymentStatus.PAID) {
      throw new PaymentAlreadySettledException();
    }

    // Namespaced so a reference can never collide with a gateway id, and so the
    // unique constraint rejects the same reference being claimed twice.
    const providerTransactionId = `INSTAPAY:${dto.reference}`;

    try {
      const transaction = await this.prisma.paymentTransaction.create({
        data: {
          paymentId: order.payment.id,
          providerTransactionId,
          status: PaymentStatus.PENDING,
          rawResponse: {
            reference: dto.reference,
            note: dto.note ?? null,
            submittedBy: userId,
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return {
        transactionId: transaction.id,
        reference: dto.reference,
        status: 'AWAITING_CONFIRMATION',
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateInstapayReferenceException();
      }
      throw err;
    }
  }

  /**
   * Branch staff confirms (or rejects) a submitted InstaPay reference after
   * checking the bank statement. Confirming settles the payment.
   */
  async confirmInstapayTransfer(staffUserId: string, transactionId: string, accept: boolean) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: { payment: { include: { order: true } } },
    });

    if (!transaction) throw new PaymentNotFoundException();
    if (transaction.status !== PaymentStatus.PENDING) {
      throw new PaymentNotPendingException();
    }

    await this.requireBranchStaff(staffUserId, transaction.payment.order.branchId);

    const nextStatus = accept ? PaymentStatus.PAID : PaymentStatus.FAILED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentTransaction.update({
        where: { id: transactionId },
        data: { status: nextStatus },
      });
      await tx.payment.update({
        where: { id: transaction.paymentId },
        data: { status: nextStatus },
      });
      await tx.order.update({
        where: { id: transaction.payment.orderId },
        data: { paymentStatus: nextStatus },
      });
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Payment detail for an order, visible to its customer or the branch staff. */
  async findForOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: { include: { transactions: { orderBy: { createdAt: 'desc' } } } },
        paymentMethod: true,
      },
    });

    if (!order) throw new OrderNotFoundException();
    if (order.customerId !== userId) {
      await this.requireBranchStaff(userId, order.branchId);
    }
    if (!order.payment) throw new PaymentNotFoundException();

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      method: order.paymentMethod.code,
      amount: Number(order.payment.amount),
      status: order.payment.status,
      transactions: order.payment.transactions,
    };
  }

  /** Pending InstaPay references awaiting staff confirmation at one branch. */
  async pendingTransfersForBranch(staffUserId: string, branchId: string) {
    await this.requireBranchStaff(staffUserId, branchId);

    return this.prisma.paymentTransaction.findMany({
      where: {
        status: PaymentStatus.PENDING,
        providerTransactionId: { startsWith: 'INSTAPAY:' },
        payment: { order: { branchId } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        payment: {
          select: {
            amount: true,
            order: { select: { id: true, orderNumber: true, total: true } },
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async markProcessed(webhookId: string) {
    await this.prisma.paymentWebhook.update({
      where: { id: webhookId },
      data: { processedAt: new Date() },
    });
  }

  private async requireBranchStaff(userId: string, branchId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({ where: { userId, branchId } });
    if (!staff) throw new NotBranchStaffException();
    return staff;
  }
}
