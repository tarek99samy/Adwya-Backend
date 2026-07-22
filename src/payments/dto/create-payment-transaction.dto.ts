import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentStatus } from '../../common/enums';

/**
 * Each provider callback (or in-house attempt) is recorded here. The
 * `providerTransactionId` is the idempotency key — unique on the column
 * (`@@unique`), so re-posting the same webhook no-ops at the DB layer.
 * See `domain-notes.md` §5.
 */
export class CreatePaymentTransactionDto {
  @IsUUID()
  paymentId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  providerTransactionId?: string;

  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  // Free-form provider response (full Paymob payload, etc.).
  @IsOptional()
  rawResponse?: Record<string, unknown>;
}
