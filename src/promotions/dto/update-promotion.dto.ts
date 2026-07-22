import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePromotionDto } from './create-promotion.dto';

// `medicineIds` is omitted: medicine assignments change via a dedicated
// endpoint, not via PATCH.
export class UpdatePromotionDto extends PartialType(
  OmitType(CreatePromotionDto, ['medicineIds'] as const),
) {}
