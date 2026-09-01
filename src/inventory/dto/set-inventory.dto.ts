import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Body for PUT /branches/:branchId/inventory.
 *
 * Price and availability only. Quantity is never set directly — it moves via
 * batch receipts, transfers, sales and returns so `StockMovement` stays a
 * complete ledger. A counted correction goes through the adjust endpoint.
 */
export class SetInventoryDto {
  @IsUUID()
  medicineId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
