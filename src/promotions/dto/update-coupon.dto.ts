import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateCouponDto } from './create-coupon.dto';

// Codes are immutable — rotate by creating a new coupon.
export class UpdateCouponDto extends PartialType(
  OmitType(CreateCouponDto, ['code'] as const),
) {}
