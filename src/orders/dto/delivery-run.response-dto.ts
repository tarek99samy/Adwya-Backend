export class DeliveryRunResponseDto {
  id!: string;
  orderId!: string;
  courierStaffId!: string;
  assignedAt!: string; // ISO 8601
  pickedUpAt?: string; // ISO 8601
  deliveredAt?: string; // ISO 8601
  currentLatitude?: string; // Decimal
  currentLongitude?: string; // Decimal
}
