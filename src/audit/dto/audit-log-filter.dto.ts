import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AuditLogFilterDto {
  @IsUUID()
  @IsOptional()
  actorId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  entityType?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  entityId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  action?: string;

  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @IsDateString()
  @IsOptional()
  createdTo?: string;

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
