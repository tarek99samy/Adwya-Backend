import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

// Reparenting a category is risky (re-numbers children, breaks URLs). Force
// a dedicated endpoint if it's ever needed.
export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['parentId'] as const),
) {}
