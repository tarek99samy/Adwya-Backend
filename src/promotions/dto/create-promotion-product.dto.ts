import { IsUUID } from 'class-validator';

/**
 * Pivot row linking a `Promotion` to a `Medicine`. A promotion may apply to
 * many medicines; a medicine may be in many promotions. Admin/internal DTO —
 * no public endpoint.
 */
export class CreatePromotionProductDto {
  @IsUUID()
  promotionId!: string;

  @IsUUID()
  medicineId!: string;
}
