import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateDeliveryZoneDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  /**
   * GeoJSON polygon as a JSON string. Validated structurally by the service
   * (must start with a `Polygon` type and have a closed ring). Keeping it as
   * a string avoids serializing the full object on every request.
   */
  @IsOptional()
  areaPolygon?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  deliveryFee!: number;
}
