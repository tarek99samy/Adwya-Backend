import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export class PaymentNotFoundException extends NotFoundException {
  constructor() {
    super('No payment record for this order');
  }
}

export class PaymentAlreadySettledException extends ConflictException {
  constructor() {
    super({ message: 'This payment has already been settled', code: 'PAYMENT_ALREADY_SETTLED' });
  }
}

export class PaymentNotPendingException extends ConflictException {
  constructor() {
    super({
      message: 'This payment attempt is no longer pending',
      code: 'PAYMENT_NOT_PENDING',
    });
  }
}

/**
 * Raised when a payment method is asked to do something its rail does not
 * support — e.g. requesting a gateway intent for cash-on-delivery, or
 * submitting a bank reference for a card payment.
 */
export class UnsupportedPaymentFlowException extends BadRequestException {
  constructor(reason: string) {
    super({ message: reason, code: 'UNSUPPORTED_PAYMENT_FLOW' });
  }
}

export class DuplicateInstapayReferenceException extends ConflictException {
  constructor() {
    super({
      message: 'This InstaPay reference has already been submitted',
      code: 'DUPLICATE_INSTAPAY_REFERENCE',
    });
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export class RefundNotFoundException extends NotFoundException {
  constructor() {
    super('Refund not found');
  }
}

export class RefundExceedsPaidAmountException extends BadRequestException {
  constructor(requested: number, refundable: number) {
    super({
      message: `Refund of ${requested} exceeds the ${refundable} still refundable on this order.`,
      code: 'REFUND_EXCEEDS_PAID_AMOUNT',
      requested,
      refundable,
    });
  }
}

export class OrderNotRefundableException extends ConflictException {
  constructor(reason: string) {
    super({ message: `This order cannot be refunded: ${reason}`, code: 'ORDER_NOT_REFUNDABLE' });
  }
}

export class IllegalRefundTransitionException extends ConflictException {
  constructor(from: string, to: string) {
    super({
      message: `A refund cannot move from ${from} to ${to}.`,
      code: 'ILLEGAL_REFUND_TRANSITION',
      from,
      to,
    });
  }
}
