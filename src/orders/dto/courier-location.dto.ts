import { Transform } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

/** One GPS tick from the courier app (POST /orders/:id/delivery/location). */
export class CourierLocationDto {
  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  latitude!: number;

  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  longitude!: number;
}
