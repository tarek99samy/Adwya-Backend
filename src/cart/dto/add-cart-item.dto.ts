import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Body for POST /cart/items.
 *
 * Note: a cart is branch-scoped — it has at most one `branchId` at a time.
 * If the caller adds an item whose `BranchInventory.medicineId` resolves to a
 * branch different from the current cart's `branchId`, the service layer must
 * decide: either reject the add (preferred when the cart has items) OR clear
 * the cart first (when the cart is empty and the user is switching branches).
 * This DTO does NOT enforce that — it only validates the per-item payload.
 */
export class AddCartItemDto {
  @IsUUID()
  medicineId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  quantity!: number;
}
