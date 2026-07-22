import { PaymentStatus } from '../../common/enums';

export class PaymentResponseDto {
  id!: string;
  orderId!: string;
  paymentMethodId!: string;
  amount!: string; // Decimal serialized as string
  status!: PaymentStatus;
  createdAt!: string; // ISO 8601
  updatedAt!: string; // ISO 8601
}
