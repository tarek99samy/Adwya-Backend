import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Gateway abstraction.
 *
 * Nothing in the payments module talks to a gateway directly — it talks to
 * this. Swapping the stub for real Paymob is one class plus a provider binding
 * in `payments.module.ts`; no service or controller changes.
 */
export interface PaymentIntent {
  /** Provider-side id for this attempt. Becomes `PaymentTransaction.providerTransactionId`. */
  providerTransactionId: string;
  /** Where to send the customer to pay. */
  redirectUrl: string;
  expiresAt: Date;
}

export interface WebhookVerdict {
  signatureValid: boolean;
  /** Correlates the callback back to a PaymentTransaction. */
  providerTransactionId?: string;
  /** What the provider says happened. */
  outcome?: 'PAID' | 'FAILED';
  amount?: number;
}

export abstract class PaymentProvider {
  /** Provider tag written to `PaymentWebhook.provider`. */
  abstract readonly name: string;

  abstract createIntent(input: {
    orderId: string;
    orderNumber: string;
    amount: number;
    customerPhone: string;
  }): Promise<PaymentIntent>;

  /**
   * Verifies a raw callback. Implementations must be pure — logging and
   * persistence are the service's job, so an invalid payload is still
   * recorded rather than thrown away.
   */
  abstract verifyWebhook(payload: Record<string, unknown>, signature?: string): WebhookVerdict;
}

/**
 * Development stand-in. Mints deterministic-looking ids and verifies webhooks
 * against a shared HMAC secret, so the full idempotency and reconciliation
 * path is exercisable end-to-end with no gateway account.
 *
 * The signature scheme mirrors Paymob's shape (HMAC-SHA512 over concatenated
 * fields) so replacing this class does not change the controller contract.
 */
@Injectable()
export class StubPaymentProvider extends PaymentProvider {
  readonly name = 'STUB';
  private readonly logger = new Logger(StubPaymentProvider.name);

  constructor(private readonly secret: string) {
    super();
  }

  createIntent(input: {
    orderId: string;
    orderNumber: string;
    amount: number;
    customerPhone: string;
  }): Promise<PaymentIntent> {
    const providerTransactionId = `STUB-${input.orderNumber}-${Date.now().toString(36)}`;
    this.logger.warn(
      `StubPaymentProvider issued a fake intent for ${input.orderNumber}. No real payment will occur.`,
    );

    return Promise.resolve({
      providerTransactionId,
      redirectUrl: `https://payments.example/stub/checkout?ref=${encodeURIComponent(providerTransactionId)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  }

  verifyWebhook(payload: Record<string, unknown>, signature?: string): WebhookVerdict {
    const providerTransactionId =
      typeof payload.providerTransactionId === 'string' ? payload.providerTransactionId : undefined;
    const rawOutcome = typeof payload.outcome === 'string' ? payload.outcome : undefined;
    const amount = typeof payload.amount === 'number' ? payload.amount : undefined;

    const expected = this.sign({ providerTransactionId, outcome: rawOutcome, amount });
    const signatureValid = Boolean(signature) && safeEqual(expected, signature as string);

    return {
      signatureValid,
      providerTransactionId,
      outcome: rawOutcome === 'PAID' || rawOutcome === 'FAILED' ? rawOutcome : undefined,
      amount,
    };
  }

  /** Exposed so tests and local tooling can produce a valid signature. */
  sign(fields: {
    providerTransactionId?: string;
    outcome?: string;
    amount?: number;
  }): string {
    const canonical = [fields.providerTransactionId ?? '', fields.outcome ?? '', fields.amount ?? '']
      .join('|');
    return createHmac('sha512', this.secret).update(canonical).digest('hex');
  }
}

/** Constant-time compare that tolerates length mismatch without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
