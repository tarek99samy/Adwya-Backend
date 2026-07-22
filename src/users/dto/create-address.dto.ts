import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  building?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  street!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  area!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  governorate!: string;

  // validate lat/lng ranges per domain-notes.md.
  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  latitude!: number;

  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  longitude!: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
