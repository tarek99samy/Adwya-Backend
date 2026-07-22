import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Query string for GET /cart. The cart is implicit per-user (one cart per
 * `userId`), so userId is not a filter — the controller derives it from the
 * authenticated principal. The branch scope is the natural primary filter
 * and `medicineId` is a convenience to limit to a single line item.
 */
export class CartFilterDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  medicineId?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
