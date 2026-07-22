import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePharmacyDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  nameAr?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  taxNumber?: string;
}
