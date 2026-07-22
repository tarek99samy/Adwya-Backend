export class ReviewResponseDto {
  id!: string;
  orderId!: string;
  userId!: string;
  branchId!: string;
  rating!: number;
  comment?: string;
  createdAt!: string; // ISO 8601
}
