import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class InventoryFilterDto {
  @IsUUID()
  @IsOptional()
  medicineId?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isAvailable?: boolean;

  /** Restricts the list to rows at or below `lowStockThreshold`. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowStock?: boolean;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  lowStockThreshold?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
