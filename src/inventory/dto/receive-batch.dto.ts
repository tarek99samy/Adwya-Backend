import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { BatchLocationType } from '../../common/enums';

/**
 * Goods-in. Exactly one of warehouseId / branchId must be set and must agree
 * with locationType — validated in the service and enforced by the
 * `batches_location_type_consistency` CHECK constraint.
 */
export class ReceiveBatchDto {
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

  @IsString()
  @MaxLength(60)
  batchNumber!: string;

  @IsDateString()
  expiryDate!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  costPrice!: number;

  // Shelf price to set when this receipt creates the BranchInventory row.
  // Ignored when the row already exists — repricing goes through PUT inventory.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  sellingPrice?: number;
}
