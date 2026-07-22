import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CampaignFilterDto {
  @IsString()
  @IsOptional()
  name?: string;

  // Optional window filter — campaigns active at a given moment.
  @IsDateString()
  @IsOptional()
  activeAt?: string;

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
