import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

/**
 * A cart is scoped to exactly one branch (domain-notes.md §1.1). Adding an item
 * stocked by a different branch is rejected rather than silently clearing the
 * cart — the client is expected to prompt, then call POST /cart/switch-branch.
 */
export class CartBranchMismatchException extends ConflictException {
  constructor(currentBranchId: string, incomingBranchId: string) {
    super({
      message:
        'Your cart already contains items from another pharmacy. Clear it before adding items from a different branch.',
      code: 'CART_BRANCH_MISMATCH',
      currentBranchId,
      incomingBranchId,
    });
  }
}

export class CartEmptyException extends BadRequestException {
  constructor() {
    super('Your cart is empty');
  }
}

export class CartItemNotFoundException extends NotFoundException {
  constructor() {
    super('Cart item not found');
  }
}

// ---------------------------------------------------------------------------
// Catalog / inventory
// ---------------------------------------------------------------------------

export class MedicineNotStockedException extends NotFoundException {
  constructor(medicineId: string) {
    super({
      message: 'This medicine is not stocked by the selected pharmacy',
      code: 'MEDICINE_NOT_STOCKED',
      medicineId,
    });
  }
}

/**
 * Controlled medicines (narcotics and equivalents) are never orderable in-app.
 * They remain browsable in the catalog but are blocked at cart and checkout.
 */
export class ControlledMedicineException extends ForbiddenException {
  constructor(medicineName: string) {
    super({
      message: `"${medicineName}" is a controlled medicine and cannot be ordered through the app. Please visit the pharmacy in person.`,
      code: 'CONTROLLED_MEDICINE',
    });
  }
}

export class InsufficientStockException extends ConflictException {
  constructor(medicineName: string, requested: number, available: number) {
    super({
      message: `Only ${available} unit(s) of "${medicineName}" are available (you requested ${requested}).`,
      code: 'INSUFFICIENT_STOCK',
      requested,
      available,
    });
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export class PrescriptionRequiredException extends BadRequestException {
  constructor(medicineNames: string[]) {
    super({
      message: `A prescription image is required for: ${medicineNames.join(', ')}.`,
      code: 'PRESCRIPTION_REQUIRED',
      medicineNames,
    });
  }
}

export class OutsideDeliveryAreaException extends BadRequestException {
  constructor() {
    super({
      message: 'The selected address is outside this pharmacy\u2019s delivery area.',
      code: 'OUTSIDE_DELIVERY_AREA',
    });
  }
}

export class AddressNotFoundException extends NotFoundException {
  constructor() {
    super('Delivery address not found');
  }
}

export class PaymentMethodUnavailableException extends BadRequestException {
  constructor() {
    super('The selected payment method is not available');
  }
}

export class BranchUnavailableException extends BadRequestException {
  constructor() {
    super('This pharmacy branch is not currently accepting orders');
  }
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export class InvalidCouponException extends BadRequestException {
  constructor(reason: string) {
    super({ message: `Coupon cannot be applied: ${reason}`, code: 'INVALID_COUPON' });
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export class OrderNotFoundException extends NotFoundException {
  constructor() {
    super('Order not found');
  }
}

/**
 * The OrderStatus enum permits illegal jumps (PENDING_CONFIRMATION → DELIVERED);
 * the allowed-transitions map in OrdersService is what actually enforces the
 * state machine (domain-notes.md §3).
 */
export class IllegalOrderTransitionException extends ConflictException {
  constructor(from: string, to: string) {
    super({
      message: `An order cannot move from ${from} to ${to}.`,
      code: 'ILLEGAL_ORDER_TRANSITION',
      from,
      to,
    });
  }
}

export class OrderNotCancellableException extends ConflictException {
  constructor(status: string) {
    super({
      message: `This order can no longer be cancelled (it is ${status}). Please contact the pharmacy.`,
      code: 'ORDER_NOT_CANCELLABLE',
      status,
    });
  }
}

export class PrescriptionNotApprovedException extends ConflictException {
  constructor() {
    super({
      message: 'This order is waiting for a pharmacist to review the prescription.',
      code: 'PRESCRIPTION_NOT_APPROVED',
    });
  }
}

export class PrescriptionNotFoundException extends NotFoundException {
  constructor() {
    super('Prescription not found');
  }
}

export class PrescriptionAlreadyReviewedException extends ConflictException {
  constructor() {
    super('This prescription has already been reviewed');
  }
}

/**
 * Cancelling an order does not touch its prescription, so a cancelled order's
 * prescription stays in the pharmacist queue. Reviewing it then would restore
 * stock that cancelling already restored, and write a status over a terminal
 * one. The order has to still be live for the verdict to mean anything.
 */
export class OrderNoLongerLiveException extends ConflictException {
  constructor(status: string) {
    super({
      message: `This order is already ${status}; its prescription can no longer be reviewed.`,
      code: 'ORDER_NO_LONGER_LIVE',
      status,
    });
  }
}

// ---------------------------------------------------------------------------
// Staff authorisation
// ---------------------------------------------------------------------------

export class NotBranchStaffException extends ForbiddenException {
  constructor() {
    super('You are not a staff member at this pharmacy branch');
  }
}

export class PharmacistRoleRequiredException extends ForbiddenException {
  constructor() {
    super('Only a pharmacist can review prescriptions');
  }
}
