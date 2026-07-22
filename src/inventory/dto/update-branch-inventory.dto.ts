import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreateBranchInventoryDto } from './create-branch-inventory.dto';

export class UpdateBranchInventoryDto extends PartialType(
  OmitType(CreateBranchInventoryDto, ['branchId', 'medicineId'] as const),
) {}
