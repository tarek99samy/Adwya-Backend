import { IsUUID } from 'class-validator';

/**
 * Records a single coupon use against a specific order. Should normally be
 * written by the order-checkout service in the same transaction as the order
 * (see `domain-notes.md` §6 — race conditions on `maxUses`/`maxUsesPerUser`).
 *
 * Exposed as a DTO only so admin tooling / refunds can backfill or amend in
 * exceptional cases; the hot path should not call this controller.
 */
export class CreateCouponUsageDto {
  @IsUUID()
  couponId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  orderId!: string;
}
