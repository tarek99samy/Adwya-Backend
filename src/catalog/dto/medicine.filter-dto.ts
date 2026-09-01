import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class MedicineFilterDto {
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsUUID()
  @IsOptional()
  brandId?: string;

  @IsUUID()
  @IsOptional()
  manufacturerId?: string;

  @IsOptional()
  // `Type(() => Boolean)` would coerce the string "false" to `true`;
  // query params arrive as strings, so map them explicitly.
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  requiresPrescription?: boolean;

  @IsString()
  @IsOptional()
  search?: string; // free-text on name / genericName / barcode — service decides

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  nearLatitude?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  nearLongitude?: number;

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
