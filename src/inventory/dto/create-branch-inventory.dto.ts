import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateBranchInventoryDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  medicineId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  quantityAvailable?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
