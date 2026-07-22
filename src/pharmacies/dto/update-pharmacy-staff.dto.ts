import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreatePharmacyStaffDto } from './create-pharmacy-staff.dto';

// `userId` ties a staff record to a user account. You shouldn't re-link
// it via PATCH — delete and create a new row instead.
export class UpdatePharmacyStaffDto extends PartialType(
  OmitType(CreatePharmacyStaffDto, ['userId'] as const),
) {}
