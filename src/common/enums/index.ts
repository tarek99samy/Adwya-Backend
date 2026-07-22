// Re-export Prisma enum values for DTOs. We deliberately re-export from
// `@prisma/client` rather than duplicating — DTOs stay in sync with the
// schema automatically, and we keep the source of truth in one place.
export {
  BatchLocationType,
  BranchStatus,
  DiscountType,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  PaymentStatus,
  PharmacyStaffRole,
  PrescriptionStatus,
  RefundStatus,
  StockMovementType,
  UserType,
  DevicePlatform,
} from '@prisma/client';
