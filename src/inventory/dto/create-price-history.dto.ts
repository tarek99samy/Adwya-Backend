import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreatePriceHistoryDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  medicineId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price!: number;

  /**
   * When the price takes effect. Defaults to `now()` in the service.
   * ISO-8601 string.
   */
  @IsOptional()
  effectiveFrom?: string;
}
