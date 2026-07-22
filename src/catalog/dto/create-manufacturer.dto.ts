import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateManufacturerDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  // ISO 3166-1 alpha-2 country code (e.g. "EG", "DE"). Not strictly required
  // — many EG manufacturers have obscure country records — but the field is
  // a 2-letter string when present.
  @IsString()
  @Length(2, 2)
  @IsOptional()
  country?: string;
}
