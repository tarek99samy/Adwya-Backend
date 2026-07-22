import { OrderStatus } from '../../common/enums';

/**
 * Standalone OrderItem shape (without orderId — caller already knows the
 * parent order from the route). Used in admin/refund contexts where items
 * are returned in isolation.
 */
export class OrderItemStandaloneResponseDto {
  id!: string;
  medicineId!: string;
  medicineNameSnapshot!: string;
  unitPriceSnapshot!: string; // Decimal
  quantity!: number;
  subtotal!: string; // Decimal
}

export class OrderStatusHistoryResponseDto {
  id!: string;
  orderId!: string;
  status!: OrderStatus;
  changedById?: string;
  note?: string;
  createdAt!: string; // ISO 8601
}
