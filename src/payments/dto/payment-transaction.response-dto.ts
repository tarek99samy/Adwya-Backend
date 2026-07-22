import { PaymentStatus } from '../../common/enums';

export class PaymentTransactionResponseDto {
  id!: string;
  paymentId!: string;
  providerTransactionId?: string;
  status!: PaymentStatus;
  rawResponse?: Record<string, unknown>;
  createdAt!: string; // ISO 8601
}
