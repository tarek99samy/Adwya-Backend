import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateProfileDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]+$/, {
    message: 'name must be uppercase with underscores (e.g. "PHARMACY_MANAGER")',
  })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
