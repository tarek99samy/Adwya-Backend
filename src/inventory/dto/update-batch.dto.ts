import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreateBatchDto } from './create-batch.dto';

// `medicineId` and `locationType` are immutable after creation — moving a
// batch across medicines or locations is a different operation.
export class UpdateBatchDto extends PartialType(
  OmitType(CreateBatchDto, ['medicineId', 'locationType'] as const),
) {}
