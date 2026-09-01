import { Logger } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import type { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus, RefundStatus } from '../common/enums';
import {
  IllegalRefundTransitionException,
  OrderNotRefundableException,
  RefundExceedsPaidAmountException,
} from '../common/exceptions/payments.exceptions';

const ADMIN = 'admin-1';

describe('RefundsService', () => {
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let refunds: RefundsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    tx = {
      refund: {
        update: jest.fn().mockResolvedValue({ id: 'r1' }),
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        // The in-transaction re-sum. Defaults to "nothing else committed",
        // so the ceiling guard passes unless a test says otherwise.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      payment: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
      branchInventory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      stockMovement: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    prisma = {
      order: { findUnique: jest.fn() },
      refund: { create: jest.fn().mockResolvedValue({ id: 'r1' }), findUnique: jest.fn() },
      paymentTransaction: { findFirst: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (c: unknown) => unknown)(tx) : Promise.resolve([]),
      ),
    };

    refunds = new RefundsService(prisma as unknown as PrismaService);
  });

  const paidOrder = (over: Record<string, unknown> = {}) => ({
    id: 'order-1',
    orderNumber: 'ADW-1',
    branchId: 'branch-a',
    status: OrderStatus.DELIVERED,
    payment: { id: 'pay-1', amount: 100, status: PaymentStatus.PAID },
    refunds: [],
    items: [{ medicineId: 'med-1', quantity: 2 }],
    ...over,
  });

  describe('create', () => {
    it('raises a PENDING refund against a paid order', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder());

      await refunds.create(ADMIN, { orderId: 'order-1', amount: 40 });

      expect(tx.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-1',
          amount: 40,
          status: RefundStatus.PENDING,
          processedById: ADMIN,
        }),
      });
    });

    it('refuses an order whose payment never settled', async () => {
      prisma.order.findUnique.mockResolvedValue(
        paidOrder({ payment: { id: 'pay-1', amount: 100, status: PaymentStatus.PENDING } }),
      );

      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 10 })).rejects.toThrow(
        OrderNotRefundableException,
      );
    });

    it('refuses more than the order was paid', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder());

      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 150 })).rejects.toThrow(
        RefundExceedsPaidAmountException,
      );
    });

    it('counts existing refunds against the ceiling', async () => {
      prisma.order.findUnique.mockResolvedValue(
        paidOrder({
          refunds: [{ id: 'r0', amount: 70, status: RefundStatus.COMPLETED }],
        }),
      );

      // 70 already refunded, so only 30 remains.
      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 40 })).rejects.toThrow(
        RefundExceedsPaidAmountException,
      );
      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 30 })).resolves.toBeDefined();
    });

    it('ignores rejected refunds when computing the ceiling', async () => {
      prisma.order.findUnique.mockResolvedValue(
        paidOrder({ refunds: [{ id: 'r0', amount: 90, status: RefundStatus.REJECTED }] }),
      );

      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 100 })).resolves.toBeDefined();
    });

    it('rolls back when a concurrent refund pushed the total over the ceiling', async () => {
      // Both admins saw 100 of headroom; the other one committed first, so the
      // in-transaction re-sum is what catches this one.
      prisma.order.findUnique.mockResolvedValue(paidOrder());
      tx.refund.aggregate.mockResolvedValue({ _sum: { amount: 160 } });

      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 60 })).rejects.toThrow(
        RefundExceedsPaidAmountException,
      );
    });

    it('refuses a zero or negative amount', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder());

      await expect(refunds.create(ADMIN, { orderId: 'order-1', amount: 0 })).rejects.toThrow(
        RefundExceedsPaidAmountException,
      );
    });

    it('refuses a payment transaction belonging to a different order', async () => {
      prisma.order.findUnique.mockResolvedValue(paidOrder());
      prisma.paymentTransaction.findFirst.mockResolvedValue(null);

      await expect(
        refunds.create(ADMIN, { orderId: 'order-1', amount: 10, paymentTransactionId: 'ptx-x' }),
      ).rejects.toThrow(OrderNotRefundableException);
    });
  });

  describe('decide', () => {
    const refundRow = (over: Record<string, unknown> = {}) => ({
      id: 'r1',
      amount: 100,
      status: RefundStatus.APPROVED,
      reason: null,
      order: paidOrder(),
      ...over,
    });

    it('rejects an illegal status jump', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ status: RefundStatus.PENDING }),
      );

      // PENDING cannot go straight to COMPLETED.
      await expect(
        refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED }),
      ).rejects.toThrow(IllegalRefundTransitionException);
    });

    it('rejects any move out of a terminal state', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ status: RefundStatus.COMPLETED }),
      );

      await expect(
        refunds.decide(ADMIN, 'r1', { status: RefundStatus.APPROVED }),
      ).rejects.toThrow(IllegalRefundTransitionException);
    });

    it('marks the payment REFUNDED when the full amount is returned', async () => {
      prisma.refund.findUnique.mockResolvedValue(refundRow({ amount: 100 }));

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.REFUNDED },
      });
    });

    it('marks the payment PARTIALLY_REFUNDED on a partial return', async () => {
      prisma.refund.findUnique.mockResolvedValue(refundRow({ amount: 30 }));

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.PARTIALLY_REFUNDED },
      });
    });

    it('does not restore stock for a delivered order', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ order: paidOrder({ status: OrderStatus.DELIVERED }) }),
      );

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.branchInventory.updateMany).not.toHaveBeenCalled();
      expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
    });

    it('restores stock when the goods never reached the customer', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ order: paidOrder({ status: OrderStatus.OUT_FOR_DELIVERY }) }),
      );

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.branchInventory.updateMany).toHaveBeenCalledWith({
        where: { branchId: 'branch-a', medicineId: 'med-1' },
        data: { quantityAvailable: { increment: 2 } },
      });
      expect(tx.stockMovement.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            movementType: 'RETURN',
            quantity: 2,
            referenceType: 'REFUND',
          }),
        ],
      });
    });

    it('does not restore stock twice for an order that was already cancelled', async () => {
      // Cancelling the order already incremented inventory and wrote a RETURN
      // movement. Doing it again here would credit the branch for units it
      // never lost.
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ order: paidOrder({ status: OrderStatus.CANCELLED }) }),
      );

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.branchInventory.updateMany).not.toHaveBeenCalled();
      expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
    });

    it('does not restore stock twice for an order that was rejected', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ order: paidOrder({ status: OrderStatus.REJECTED }) }),
      );

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.COMPLETED });

      expect(tx.branchInventory.updateMany).not.toHaveBeenCalled();
    });

    it('touches neither payment nor stock when rejecting', async () => {
      prisma.refund.findUnique.mockResolvedValue(
        refundRow({ status: RefundStatus.PENDING }),
      );

      await refunds.decide(ADMIN, 'r1', { status: RefundStatus.REJECTED });

      expect(tx.payment.update).not.toHaveBeenCalled();
      expect(tx.branchInventory.updateMany).not.toHaveBeenCalled();
    });
  });
});
