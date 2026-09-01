import { IsUUID } from 'class-validator';

/**
 * Body for POST /payments/intent. Only the order is supplied — the amount is
 * always read from the server-side Order total, never from the client.
 */
export class CreatePaymentIntentDto {
  @IsUUID()
  orderId!: string;
}
