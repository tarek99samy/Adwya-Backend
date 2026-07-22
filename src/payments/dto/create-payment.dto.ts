import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentStatus } from '../../common/enums';

/**
 * One `Payment` per order (`Order.paymentMethodId` is set; `Payment` is the
 * linked record). Money values are server-recomputed from `Order.total` —
 * client-supplied `amount` is rejected.
 *
 * This DTO exists for admin back-fill / reconciliation; the hot path is the
 * order checkout service, which creates both `Order` and `Payment` in the
 * same `$transaction`. See `domain-notes.md` §1 step 4.
 */
export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  paymentMethodId!: string;

  // Server enforces this against `Order.total`; we still validate shape
  // here so a malformed payload fails fast at the API edge.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount!: number;

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;
}
