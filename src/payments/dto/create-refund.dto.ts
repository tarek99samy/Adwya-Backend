import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RefundStatus } from '../../common/enums';

/**
 * Refunds reverse a specific `PaymentTransaction` (not just an order), so a
 * single failed attempt among several can be reconciled with the provider
 * independently. See `domain-notes.md` §5.
 *
 * `amount` is server-recomputed against the linked transaction's value; the
 * validator only checks shape here.
 */
export class CreateRefundDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  @IsOptional()
  paymentTransactionId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsEnum(RefundStatus)
  // Defaults to PENDING; an admin-issued refund is usually PENDING then moves
  // to APPROVED → COMPLETED via the service layer.
  status?: RefundStatus;
}
