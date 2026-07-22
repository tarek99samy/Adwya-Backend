import { DiscountType } from '../../common/enums';

export class PromotionResponseDto {
  id!: string;
  campaignId?: string;
  name!: string;
  discountType!: DiscountType;
  discountValue!: string; // Decimal serialized as string
  startDate!: string; // ISO 8601
  endDate!: string; // ISO 8601
  isActive!: boolean;
  medicineIds?: string[];
}
