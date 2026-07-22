export class CouponUsageResponseDto {
  id!: string;
  couponId!: string;
  userId!: string;
  orderId!: string;
  usedAt!: string; // ISO 8601
}
