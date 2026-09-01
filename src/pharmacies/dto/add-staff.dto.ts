import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PharmacyStaffRole } from '../../common/enums';
import { IsEgyptianPhone } from '../../common/validators';

/**
 * Adds a staff member to a branch. `PharmacyStaff.userId` is unique, so a
 * person belongs to exactly one branch at a time.
 */
export class AddStaffDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsString()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  // PHARMACIST gates prescription review; COURIER gates delivery runs.
  @IsEnum(PharmacyStaffRole)
  role!: PharmacyStaffRole;
}
