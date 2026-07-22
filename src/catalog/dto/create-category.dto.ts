import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  nameAr?: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;
}
