import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { StockMovementType } from '../../common/enums';

/**
 * Stock movements are an internal ledger — they should not be created from a
 * public endpoint. This DTO is the shape the inventory/order services pass
 * to the stock-movement writer. There is intentionally no Update DTO.
 */
export class CreateStockMovementDto {
  @IsUUID()
  medicineId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsEnum(StockMovementType)
  movementType!: StockMovementType;

  // Positive = increase, negative = decrease.
  @IsInt()
  quantity!: number;

  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  referenceType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsUUID()
  @IsOptional()
  performedById?: string;
}
