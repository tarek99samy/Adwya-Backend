import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

/**
 * Reviews are largely immutable — `orderId` is the natural unique key. Only
 * the comment can be edited, and only within a short window after creation
 * (enforced by the service, not here).
 */
export class UpdateReviewDto extends PartialType(
  OmitType(CreateReviewDto, ['orderId', 'userId', 'branchId', 'rating'] as const),
) {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
