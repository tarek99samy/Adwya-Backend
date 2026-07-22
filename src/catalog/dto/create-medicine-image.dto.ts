import { IsInt, IsOptional, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class CreateMedicineImageDto {
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  url!: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(1000)
  sortOrder?: number;
}
