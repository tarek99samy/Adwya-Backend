import { RefundStatus } from '../../common/enums';

export class RefundResponseDto {
  id!: string;
  orderId!: string;
  paymentTransactionId?: string;
  amount!: string; // Decimal serialized as string
  reason?: string;
  status!: RefundStatus;
  processedById?: string;
  createdAt!: string; // ISO 8601
}
