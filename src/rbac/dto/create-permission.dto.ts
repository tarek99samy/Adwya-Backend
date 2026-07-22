import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  // Codes look like "orders.view", "medicines.edit" — must be lowercase with
  // dot/underscore separators and no spaces.
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, {
    message: 'code must be dotted lowercase (e.g. "orders.view")',
  })
  @MaxLength(120)
  code!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
