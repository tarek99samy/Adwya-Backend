import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BatchLocationType } from '../../common/enums';

/**
 * Note: a CHECK constraint enforces that exactly one of `warehouseId` /
 * `branchId` is set, matching `locationType`. That's a DB-level concern; the
 * service layer should validate the same rule so requests fail fast.
 */
export class CreateBatchDto {
  @IsUUID()
  medicineId!: string;

  @IsEnum(BatchLocationType)
  locationType!: BatchLocationType;

  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  // Manufacturer batch numbers are alphanumeric, often hyphenated.
  // Keep the constraint loose (length + alnum + dash) — varies by
  // manufacturer and not worth a regex war.
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'batchNumber may only contain letters, digits, and dashes' })
  @MaxLength(60)
  batchNumber!: string;

  @IsDateString()
  expiryDate!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  costPrice!: number;
}
