import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePharmacyBranchDto } from './create-pharmacy-branch.dto';

/**
 * `pharmacyId` is fixed at creation (a branch belongs to one chain) and
 * `licenseNumber` is a per-location regulator ID that shouldn't change
 * casually, so neither is patchable.
 */
export class UpdatePharmacyBranchDto extends PartialType(
  OmitType(CreatePharmacyBranchDto, ['pharmacyId', 'licenseNumber'] as const),
) {}
