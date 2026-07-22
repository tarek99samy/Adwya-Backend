import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Admin/internal DTO for seeding / managing the `payment_methods` table.
 *
 * MVP payment methods are seeded admin rows (CASH, VISA_ON_DELIVERY, INSTAPAY);
 * new providers (e.g. PAYMOB_CARD) are added by ops without a code deploy.
 * There is intentionally no public POST endpoint to create them.
 */
export class CreatePaymentMethodDto {
  // Codes are upper-snake so they can be safely embedded in switch statements
  // and provider routing tables. Must start with a letter to avoid leading
  // underscores / digits, which are usually reserved for "system" identifiers.
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]+$/, {
    message:
      'code must be upper-snake (e.g. CASH, VISA_ON_DELIVERY, PAYMOB_CARD)',
  })
  @MaxLength(60)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(0)
  @Max(1000)
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;
}
