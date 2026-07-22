import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PaymentTransactionFilterDto {
  @IsString()
  @IsOptional()
  providerTransactionId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  // Note: `signatureValid` is set after the signature check, not on insert.
  // Useful for filtering out spam / untrusted callbacks.
  signatureValid?: boolean;

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
