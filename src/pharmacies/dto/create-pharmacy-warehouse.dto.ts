import { Transform } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePharmacyWarehouseDto {
  @IsUUID()
  pharmacyId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(500)
  addressText!: string;

  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  latitude!: number;

  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  longitude!: number;
}
