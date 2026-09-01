import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { StubPaymentProvider } from './payment-provider';
import type { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '../common/enums';
import {
  DuplicateInstapayReferenceException,
  PaymentAlreadySettledException,
  UnsupportedPaymentFlowException,
} from '../common/exceptions/payments.exceptions';

const SECRET = 'test-webhook-secret';
const USER = 'user-1';

describe('PaymentsService', () => {
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let provider: StubPaymentProvider;
  let payments: PaymentsService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    tx = {
      paymentTransaction: { update: jest.fn().mockResolvedValue({}) },
      payment: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
      paymentWebhook: { update: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      order: { findUnique: jest.fn() },
      paymentWebhook: { create: jest.fn().mockResolvedValue({ id: 'wh-1' }), update: jest.fn() },
      paymentTransaction: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'ptx-1' }),
        findMany: jest.fn(),
      },
      pharmacyStaff: { findFirst: jest.fn() },
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (c: unknown) => unknown)(tx) : Promise.resolve([]),
      ),
    };

    provider = new StubPaymentProvider(SECRET);
    payments = new PaymentsService(prisma as unknown as PrismaService, provider);
  });

  const gatewayOrder = (over: Record<string, unknown> = {}) => ({
    id: 'order-1',
    orderNumber: 'ADW-TEST',
    customerId: USER,
    branchId: 'branch-a',
    total: 146,
    payment: { id: 'pay-1', orderId: 'order-1', status: PaymentStatus.PENDING },
    paymentMethod: { code: 'PAYMOB_CARD' },
    customer: { phone: '01000000001' },
    ...over,
  });

  // -------------------------------------------------------------------------
  // Intent
  // -------------------------------------------------------------------------

  describe('createIntent', () => {
    it('issues an intent and records a PENDING transaction', async () => {
      prisma.order.findUnique.mockResolvedValue(gatewayOrder());

      const result = await payments.createIntent(USER, { orderId: 'order-1' });

      expect(result.redirectUrl).toContain('http');
      expect(result.amount).toBe(146);
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pay-1',
            status: PaymentStatus.PENDING,
            providerTransactionId: result.providerTransactionId,
          }),
        }),
      );
    });

    it('refuses cash on delivery — there is nothing to redirect to', async () => {
      prisma.order.findUnique.mockResolvedValue(
        gatewayOrder({ paymentMethod: { code: 'CASH' } }),
      );

      await expect(payments.createIntent(USER, { orderId: 'order-1' })).rejects.toThrow(
        UnsupportedPaymentFlowException,
      );
    });

    it('refuses InstaPay — it is a manual transfer, not a gateway', async () => {
      prisma.order.findUnique.mockResolvedValue(
        gatewayOrder({ paymentMethod: { code: 'INSTAPAY' } }),
      );

      await expect(payments.createIntent(USER, { orderId: 'order-1' })).rejects.toThrow(
        UnsupportedPaymentFlowException,
      );
    });

    it('refuses an already-paid order', async () => {
      prisma.order.findUnique.mockResolvedValue(
        gatewayOrder({ payment: { id: 'pay-1', status: PaymentStatus.PAID } }),
      );

      await expect(payments.createIntent(USER, { orderId: 'order-1' })).rejects.toThrow(
        PaymentAlreadySettledException,
      );
    });

    it('will not let one customer pay for another customer order', async () => {
      prisma.order.findUnique.mockResolvedValue(gatewayOrder({ customerId: 'someone-else' }));

      await expect(payments.createIntent(USER, { orderId: 'order-1' })).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Webhooks — the part that must be bulletproof
  // -------------------------------------------------------------------------

  describe('handleWebhook', () => {
    const payload = (over: Record<string, unknown> = {}) => ({
      providerTransactionId: 'STUB-ADW-TEST-abc',
      outcome: 'PAID',
      amount: 146,
      ...over,
    });

    const signed = (p: Record<string, unknown>) =>
      provider.sign({
        providerTransactionId: p.providerTransactionId as string,
        outcome: p.outcome as string,
        amount: p.amount as number,
      });

    const pendingTx = {
      id: 'ptx-1',
      paymentId: 'pay-1',
      status: PaymentStatus.PENDING,
      // The amount owed. A PAID callback has to match it.
      payment: { id: 'pay-1', orderId: 'order-1', amount: 146 },
    };

    it('logs the raw payload even when the signature is invalid', async () => {
      const result = await payments.handleWebhook(payload(), 'not-a-real-signature');

      expect(prisma.paymentWebhook.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ signatureValid: false }),
      });
      expect(result).toMatchObject({ received: true, processed: false, reason: 'INVALID_SIGNATURE' });
    });

    it('never settles a payment on an invalid signature', async () => {
      await payments.handleWebhook(payload(), 'forged');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('settles the payment, transaction and order on a valid PAID callback', async () => {
      const p = payload();
      prisma.paymentTransaction.findUnique.mockResolvedValue(pendingTx);

      const result = await payments.handleWebhook(p, signed(p));

      expect(result).toMatchObject({ received: true, processed: true, outcome: 'PAID' });
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.PAID },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paymentStatus: PaymentStatus.PAID },
      });
    });

    it('refuses to settle a PAID callback for the wrong amount', async () => {
      // Correctly signed, but for 1 EGP against a 146 EGP order. Settling would
      // mark the order fully paid and write off the difference.
      const p = payload({ amount: 1 });
      prisma.paymentTransaction.findUnique.mockResolvedValue(pendingTx);

      const result = await payments.handleWebhook(p, signed(p));

      expect(result).toMatchObject({
        processed: false,
        reason: 'AMOUNT_MISMATCH',
        expected: 146,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records a FAILED callback as FAILED', async () => {
      const p = payload({ outcome: 'FAILED' });
      prisma.paymentTransaction.findUnique.mockResolvedValue(pendingTx);

      await payments.handleWebhook(p, signed(p));

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('is idempotent — a replayed webhook does not settle twice', async () => {
      const p = payload();
      // Transaction already moved to PAID by the first delivery.
      prisma.paymentTransaction.findUnique.mockResolvedValue({
        ...pendingTx,
        status: PaymentStatus.PAID,
      });

      const result = await payments.handleWebhook(p, signed(p));

      expect(result).toMatchObject({ processed: false, reason: 'ALREADY_PROCESSED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.payment.update).not.toHaveBeenCalled();
    });

    it('tolerates a callback for a transaction it has never seen', async () => {
      const p = payload();
      prisma.paymentTransaction.findUnique.mockResolvedValue(null);

      const result = await payments.handleWebhook(p, signed(p));

      expect(result).toMatchObject({ processed: false, reason: 'UNKNOWN_TRANSACTION' });
      expect(prisma.paymentWebhook.update).toHaveBeenCalled(); // still marked processed
    });

    it('tolerates a signed payload with no usable reference', async () => {
      const p = { hello: 'world' };
      const sig = provider.sign({});

      const result = await payments.handleWebhook(p, sig);

      expect(result).toMatchObject({ processed: false, reason: 'UNRECOGNISED_PAYLOAD' });
    });

    it('rejects a payload whose fields were tampered with after signing', async () => {
      const original = payload({ amount: 10 });
      const sig = signed(original);
      // Attacker keeps the signature but inflates the amount.
      const tampered = { ...original, amount: 100000 };

      const result = await payments.handleWebhook(tampered, sig);

      expect(result).toMatchObject({ processed: false, reason: 'INVALID_SIGNATURE' });
    });

    it('rejects a webhook with no signature at all', async () => {
      const result = await payments.handleWebhook(payload(), undefined);
      expect(result).toMatchObject({ processed: false, reason: 'INVALID_SIGNATURE' });
    });
  });

  // -------------------------------------------------------------------------
  // InstaPay
  // -------------------------------------------------------------------------

  describe('submitInstapayReference', () => {
    const instaOrder = (over: Record<string, unknown> = {}) => ({
      id: 'order-1',
      customerId: USER,
      branchId: 'branch-a',
      payment: { id: 'pay-1', status: PaymentStatus.PENDING },
      paymentMethod: { code: 'INSTAPAY' },
      ...over,
    });

    it('records the reference as awaiting confirmation, not paid', async () => {
      prisma.order.findUnique.mockResolvedValue(instaOrder());

      const result = await payments.submitInstapayReference(USER, 'order-1', {
        reference: 'REF-123456',
      });

      expect(result.status).toBe('AWAITING_CONFIRMATION');
      // Namespaced so a bank reference can never collide with a gateway id.
      expect(prisma.paymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            providerTransactionId: 'INSTAPAY:REF-123456',
            status: PaymentStatus.PENDING,
          }),
        }),
      );
    });

    it('rejects a reference already claimed by someone else', async () => {
      prisma.order.findUnique.mockResolvedValue(instaOrder());
      // Real shape of the unique-violation Prisma throws on a duplicate
      // providerTransactionId.
      const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.paymentTransaction.create.mockRejectedValue(dup);

      await expect(
        payments.submitInstapayReference(USER, 'order-1', { reference: 'REF-123456' }),
      ).rejects.toThrow(DuplicateInstapayReferenceException);
    });

    it('refuses when the order is not paying by InstaPay', async () => {
      prisma.order.findUnique.mockResolvedValue(
        instaOrder({ paymentMethod: { code: 'CASH' } }),
      );

      await expect(
        payments.submitInstapayReference(USER, 'order-1', { reference: 'REF-123456' }),
      ).rejects.toThrow(UnsupportedPaymentFlowException);
    });
  });

  describe('confirmInstapayTransfer', () => {
    const pending = {
      id: 'ptx-1',
      paymentId: 'pay-1',
      status: PaymentStatus.PENDING,
      payment: { orderId: 'order-1', order: { branchId: 'branch-a' } },
    };

    it('settles the payment when staff accepts', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(pending);
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1' });

      await payments.confirmInstapayTransfer('staff-1', 'ptx-1', true);

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.PAID },
      });
    });

    it('marks it FAILED when staff rejects', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(pending);
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1' });

      await payments.confirmInstapayTransfer('staff-1', 'ptx-1', false);

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('refuses a caller who is not staff at the order branch', async () => {
      prisma.paymentTransaction.findUnique.mockResolvedValue(pending);
      prisma.pharmacyStaff.findFirst.mockResolvedValue(null);

      await expect(
        payments.confirmInstapayTransfer('outsider', 'ptx-1', true),
      ).rejects.toThrow();
    });
  });
});

describe('StubPaymentProvider', () => {
  const provider = new StubPaymentProvider('s3cret');

  it('accepts its own signature', () => {
    const fields = { providerTransactionId: 'abc', outcome: 'PAID', amount: 10 };
    const verdict = provider.verifyWebhook(fields, provider.sign(fields));
    expect(verdict.signatureValid).toBe(true);
    expect(verdict.outcome).toBe('PAID');
  });

  it('rejects a signature made with a different secret', () => {
    const fields = { providerTransactionId: 'abc', outcome: 'PAID', amount: 10 };
    const other = new StubPaymentProvider('different-secret');
    expect(provider.verifyWebhook(fields, other.sign(fields)).signatureValid).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    const fields = { providerTransactionId: 'abc', outcome: 'PAID', amount: 10 };
    expect(provider.verifyWebhook(fields, provider.sign(fields).slice(0, 10)).signatureValid).toBe(
      false,
    );
  });
});
