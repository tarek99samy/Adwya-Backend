import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** Body for POST /branches/:branchId/inventory/adjust — a stock-take correction. */
export class AdjustStockDto {
  @IsUUID()
  medicineId!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  countedQuantity!: number;

  // Required: an unexplained stock adjustment is exactly what an audit needs
  // to be able to read back later.
  @IsString()
  @MaxLength(300)
  reason!: string;
}
