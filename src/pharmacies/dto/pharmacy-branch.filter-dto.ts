import { Transform } from 'class-transformer';
import { IsEnum, IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { BranchStatus } from '../../common/enums';

export class PharmacyBranchFilterDto {
  @IsEnum(BranchStatus)
  @IsOptional()
  status?: BranchStatus;

  @IsOptional()
  pharmacyId?: string;

  /**
   * If both are provided, the service layer should restrict results to
   * branches whose `ST_Distance` (when PostGIS lands) or haversine distance
   * falls within `radiusMeters` from this point.
   */
  @IsLatitude()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  nearLatitude?: number;

  @IsLongitude()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  nearLongitude?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  radiusMeters?: number;
}
