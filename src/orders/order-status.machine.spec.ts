import { OrderStatus, PrescriptionStatus } from '../common/enums';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isBlockedByPrescription,
  isCustomerCancellable,
  shouldRestoreStock,
  timestampsFor,
} from './order-status.machine';

describe('order status machine', () => {
  describe('canTransition', () => {
    it('walks the happy path end to end', () => {
      expect(canTransition(OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED)).toBe(true);
      expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.PREPARING)).toBe(true);
      expect(canTransition(OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY)).toBe(true);
      expect(canTransition(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).toBe(true);
    });

    it('rejects the illegal jump the enum would otherwise allow', () => {
      expect(canTransition(OrderStatus.PENDING_CONFIRMATION, OrderStatus.DELIVERED)).toBe(false);
      expect(canTransition(OrderStatus.PENDING_CONFIRMATION, OrderStatus.OUT_FOR_DELIVERY)).toBe(
        false,
      );
      expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.DELIVERED)).toBe(false);
    });

    it('never moves backwards', () => {
      expect(canTransition(OrderStatus.PREPARING, OrderStatus.CONFIRMED)).toBe(false);
      expect(canTransition(OrderStatus.DELIVERED, OrderStatus.OUT_FOR_DELIVERY)).toBe(false);
    });

    it('treats DELIVERED, CANCELLED and REJECTED as terminal', () => {
      for (const terminal of [
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
      ]) {
        expect(ALLOWED_TRANSITIONS[terminal]).toHaveLength(0);
        for (const target of Object.values(OrderStatus)) {
          expect(canTransition(terminal, target)).toBe(false);
        }
      }
    });

    it('allows cancellation from every live status', () => {
      for (const live of [
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.OUT_FOR_DELIVERY,
      ]) {
        expect(canTransition(live, OrderStatus.CANCELLED)).toBe(true);
      }
    });

    it('only allows REJECTED straight out of PENDING_CONFIRMATION', () => {
      expect(canTransition(OrderStatus.PENDING_CONFIRMATION, OrderStatus.REJECTED)).toBe(true);
      expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.REJECTED)).toBe(false);
    });
  });

  describe('shouldRestoreStock', () => {
    it('returns stock when a live order is cancelled or rejected', () => {
      expect(shouldRestoreStock(OrderStatus.PENDING_CONFIRMATION, OrderStatus.CANCELLED)).toBe(
        true,
      );
      expect(shouldRestoreStock(OrderStatus.PENDING_CONFIRMATION, OrderStatus.REJECTED)).toBe(true);
      expect(shouldRestoreStock(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
      expect(shouldRestoreStock(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED)).toBe(true);
    });

    it('does not touch stock on forward progress', () => {
      expect(shouldRestoreStock(OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED)).toBe(
        false,
      );
      expect(shouldRestoreStock(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)).toBe(false);
    });

    it('does not double-restore from an already terminal state', () => {
      expect(shouldRestoreStock(OrderStatus.CANCELLED, OrderStatus.CANCELLED)).toBe(false);
      expect(shouldRestoreStock(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
    });
  });

  describe('isBlockedByPrescription', () => {
    it('freezes forward progress while a prescription is under review', () => {
      expect(
        isBlockedByPrescription(OrderStatus.CONFIRMED, PrescriptionStatus.PENDING_REVIEW),
      ).toBe(true);
      expect(
        isBlockedByPrescription(OrderStatus.PREPARING, PrescriptionStatus.PENDING_REVIEW),
      ).toBe(true);
    });

    it('still lets a pending-review order be cancelled or rejected', () => {
      expect(
        isBlockedByPrescription(OrderStatus.CANCELLED, PrescriptionStatus.PENDING_REVIEW),
      ).toBe(false);
      expect(
        isBlockedByPrescription(OrderStatus.REJECTED, PrescriptionStatus.PENDING_REVIEW),
      ).toBe(false);
    });

    it('does not block once approved, or when no prescription was needed', () => {
      expect(isBlockedByPrescription(OrderStatus.CONFIRMED, PrescriptionStatus.APPROVED)).toBe(
        false,
      );
      expect(isBlockedByPrescription(OrderStatus.CONFIRMED, PrescriptionStatus.NOT_REQUIRED)).toBe(
        false,
      );
    });
  });

  describe('isCustomerCancellable', () => {
    it('allows self-cancel only before the pharmacy confirms', () => {
      expect(isCustomerCancellable(OrderStatus.PENDING_CONFIRMATION)).toBe(true);
      expect(isCustomerCancellable(OrderStatus.CONFIRMED)).toBe(false);
      expect(isCustomerCancellable(OrderStatus.PREPARING)).toBe(false);
      expect(isCustomerCancellable(OrderStatus.DELIVERED)).toBe(false);
    });
  });

  describe('timestampsFor', () => {
    it('stamps the column matching the destination status', () => {
      expect(timestampsFor(OrderStatus.CONFIRMED)).toHaveProperty('confirmedAt');
      expect(timestampsFor(OrderStatus.DELIVERED)).toHaveProperty('deliveredAt');
      expect(timestampsFor(OrderStatus.CANCELLED)).toHaveProperty('cancelledAt');
      expect(timestampsFor(OrderStatus.REJECTED)).toHaveProperty('cancelledAt');
    });

    it('stamps nothing for intermediate statuses', () => {
      expect(timestampsFor(OrderStatus.PREPARING)).toEqual({});
      expect(timestampsFor(OrderStatus.OUT_FOR_DELIVERY)).toEqual({});
    });
  });
});
