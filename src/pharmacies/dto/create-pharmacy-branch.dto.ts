import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BranchStatus } from '../../common/enums';
import { IsEgyptianPhone } from '../../common/validators';

export class CreatePharmacyBranchDto {
  @IsUUID()
  pharmacyId!: string; // uuid

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(60)
  licenseNumber!: string;

  @IsEnum(BranchStatus)
  @IsOptional()
  status?: BranchStatus;

  @IsString()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @IsString()
  @IsOptional()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  whatsappNumber?: string;

  @IsString()
  @MaxLength(500)
  addressText!: string;

  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  latitude!: number;

  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  longitude!: number;

  @IsInt()
  @Min(100)
  @Max(50000)
  @IsOptional()
  deliveryRadiusMeters?: number;

  /**
   * Free-form JSON describing opening hours.
   * E.g. `{ "mon": [{ "open": "09:00", "close": "22:00" }] }`.
   * Validated structurally by the service; shape is not enforced at the
   * transport layer because hours schedules vary.
   */
  @IsOptional()
  openingHours?: Record<string, unknown>;
}
