import { IsEnum, IsUUID } from 'class-validator';
import { PharmacyStaffRole } from '../../common/enums';

export class CreatePharmacyStaffDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  branchId!: string;

  @IsEnum(PharmacyStaffRole)
  role!: PharmacyStaffRole;
}
