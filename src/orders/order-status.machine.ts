import { OrderStatus, PrescriptionStatus } from '../common/enums';

/**
 * The OrderStatus enum on its own permits illegal jumps such as
 * PENDING_CONFIRMATION -> DELIVERED. This map is the real state machine
 * (domain-notes.md section 3):
 *
 *   PENDING_CONFIRMATION -> CONFIRMED -> PREPARING -> OUT_FOR_DELIVERY -> DELIVERED
 *                        \-> REJECTED          \-> CANCELLED
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING_CONFIRMATION]: [
    OrderStatus.CONFIRMED,
    OrderStatus.REJECTED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  // Terminal states.
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Statuses at which the goods are still with the pharmacy, so cancelling or
 * rejecting must hand the reserved stock back.
 */
const STOCK_HELD_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.OUT_FOR_DELIVERY,
];

/**
 * Stock was decremented at checkout, so any exit to CANCELLED/REJECTED from a
 * non-terminal state has to reverse it (domain-notes.md sections 2 and 3).
 */
export function shouldRestoreStock(from: OrderStatus, to: OrderStatus): boolean {
  const leavingToDeadEnd = to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED;
  return leavingToDeadEnd && STOCK_HELD_STATUSES.includes(from);
}

/**
 * A prescription-gated order is frozen at PENDING_CONFIRMATION until a
 * pharmacist approves it. Cancelling and rejecting stay open — only forward
 * progress is blocked.
 */
export function isBlockedByPrescription(
  to: OrderStatus,
  prescriptionStatus: PrescriptionStatus,
): boolean {
  if (prescriptionStatus !== PrescriptionStatus.PENDING_REVIEW) {
    return false;
  }
  return to !== OrderStatus.CANCELLED && to !== OrderStatus.REJECTED;
}

/** The customer may withdraw their own order only before the pharmacy confirms it. */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING_CONFIRMATION;
}

/** Timestamp columns Order keeps alongside `status`. */
export function timestampsFor(to: OrderStatus): Record<string, Date> {
  switch (to) {
    case OrderStatus.CONFIRMED:
      return { confirmedAt: new Date() };
    case OrderStatus.DELIVERED:
      return { deliveredAt: new Date() };
    case OrderStatus.CANCELLED:
    case OrderStatus.REJECTED:
      return { cancelledAt: new Date() };
    default:
      return {};
  }
}
