import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PaymentMethodFilterDto {
  // Boolean fields arrive as query strings ("true" / "false") over the wire;
  // `@Type(() => Boolean)` coerces them so `IsOptional()` doesn't trip on
  // the resulting string. See MedicineFilterDto for the same pattern.
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  // Optional exact-match filter on the upper-snake code. We re-validate the
  // format here so a malformed query returns 400 rather than hitting the DB
  // with junk.
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]+$/, {
    message:
      'code must be upper-snake (e.g. CASH, VISA_ON_DELIVERY, PAYMOB_CARD)',
  })
  @MaxLength(60)
  code?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
