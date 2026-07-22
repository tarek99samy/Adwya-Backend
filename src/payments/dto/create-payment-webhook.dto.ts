import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Raw provider callback log, written regardless of signature validity so we
 * have a forensic record of every payload received. The service flips
 * `signatureValid` and `processedAt` after running the validator. The
 * `provider` string is intentionally free-form to accommodate Paymob,
 * InstaPay, and any future provider without a schema change.
 */
export class CreatePaymentWebhookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  provider!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  signatureValid?: boolean;
}
