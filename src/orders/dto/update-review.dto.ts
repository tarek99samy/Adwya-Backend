import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { CreateReviewDto } from './create-review.dto';

/**
 * Reviews are largely immutable — `orderId` is the natural unique key. Only
 * the comment can be edited, and only within a short window after creation
 * (enforced by the service, not here).
 */
export class UpdateReviewDto extends PartialType(CreateReviewDto) {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
