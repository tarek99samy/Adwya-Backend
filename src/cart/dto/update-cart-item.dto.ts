import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Body for PATCH /cart/items/:id.
 *
 * The hard cap of 100 here is an abuse guard only. The real upper bound is
 * the per-branch `BranchInventory.quantityAvailable` and is enforced by the
 * service layer.
 */
export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  quantity!: number;
}
