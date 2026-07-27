import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class NotificationFilterDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  @IsString()
  @IsOptional()
  type?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}
