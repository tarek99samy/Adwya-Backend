import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Customer-submitted review for a delivered order. The DB CHECK constraint
 * (`rating BETWEEN 1 AND 5`) is added in raw SQL migration — we mirror it
 * here so the API layer rejects bad payloads with 400 instead of 500.
 */
export class CreateReviewDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  userId!: string;

  @IsUUID()
  branchId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
