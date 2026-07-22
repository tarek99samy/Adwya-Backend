import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, IsUUID, Min } from 'class-validator';

/**
 * Server-internal DTO. OrderItems are created by the checkout service inside
 * the same `$transaction` as the Order; the controller is not expected to
 * receive these from clients. Money / name are snapshotted from
 * `BranchInventory.price` / `Medicine.name` at that moment — never recomputed
 * from live inventory later. See `domain-notes.md` §1 step 4.
 */
export class CreateOrderItemDto {
  @IsUUID()
  medicineId!: string;

  @IsString()
  medicineNameSnapshot!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unitPriceSnapshot!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  subtotal!: number;
}
