import { DiscountType } from '../../common/enums';

export class CouponResponseDto {
  id!: string;
  code!: string;
  discountType!: DiscountType;
  discountValue!: string; // Decimal serialized as string
  maxUses?: number;
  maxUsesPerUser?: number;
  minOrderAmount?: string; // Decimal serialized as string
  validFrom!: string; // ISO 8601
  validTo!: string; // ISO 8601
  isActive!: boolean;
}
