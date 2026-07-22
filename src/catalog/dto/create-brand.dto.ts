import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateBrandDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string;
}
