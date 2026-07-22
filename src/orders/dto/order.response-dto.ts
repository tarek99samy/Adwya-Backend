import {
  OrderStatus,
  PaymentStatus,
  PrescriptionStatus,
} from '../../common/enums';

export class OrderItemResponseDto {
  id!: string;
  medicineId!: string;
  medicineNameSnapshot!: string;
  unitPriceSnapshot!: string; // Decimal serialized as string
  quantity!: number;
  subtotal!: string; // Decimal serialized as string
}

export class OrderResponseDto {
  id!: string;
  orderNumber!: string;
  customerId!: string;
  branchId!: string;
  addressId!: string;
  status!: OrderStatus;
  paymentMethodId!: string;
  paymentStatus!: PaymentStatus;
  prescriptionStatus!: PrescriptionStatus;
  subtotal!: string; // Decimal
  deliveryFee!: string; // Decimal
  discountTotal!: string; // Decimal
  total!: string; // Decimal
  deliveryAddressText!: string;
  deliveryLatitude!: string; // Decimal
  deliveryLongitude!: string; // Decimal
  cancelReason?: string;
  confirmedAt?: string; // ISO 8601
  deliveredAt?: string; // ISO 8601
  cancelledAt?: string; // ISO 8601
  createdAt!: string; // ISO 8601
  updatedAt!: string; // ISO 8601
  items?: OrderItemResponseDto[];
}
