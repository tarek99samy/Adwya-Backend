import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsEgyptianPhone } from '../../common/validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const num = ({ value }: { value: unknown }) => (typeof value === 'string' ? Number(value) : value);

/**
 * Public self-service registration: pharmacy + first branch + owner account in
 * one call. The branch always lands PENDING_APPROVAL — there is deliberately
 * no `status` field here, because an applicant must not be able to approve
 * itself.
 */
export class RegisterPharmacyDto {
  // --- pharmacy ---
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  nameAr?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  taxNumber?: string;

  // --- first branch ---
  @IsString()
  @MaxLength(200)
  branchName!: string;

  @IsString()
  @MaxLength(60)
  licenseNumber!: string;

  @IsString()
  @IsEgyptianPhone()
  @Transform(trim)
  branchPhone!: string;

  @IsString()
  @IsOptional()
  @IsEgyptianPhone()
  @Transform(trim)
  whatsappNumber?: string;

  @IsString()
  @MaxLength(500)
  addressText!: string;

  @IsLatitude()
  @Transform(num)
  latitude!: number;

  @IsLongitude()
  @Transform(num)
  longitude!: number;

  @IsInt()
  @Min(100)
  @Max(50000)
  @IsOptional()
  deliveryRadiusMeters?: number;

  // --- owner account ---
  @IsString()
  @MaxLength(150)
  ownerName!: string;

  @IsString()
  @IsEgyptianPhone()
  @Transform(trim)
  ownerPhone!: string;

  @IsEmail()
  @IsOptional()
  ownerEmail?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  ownerPassword!: string;
}
