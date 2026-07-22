import { PrescriptionStatus } from '../../common/enums';

export class PrescriptionResponseDto {
  id!: string;
  orderId!: string;
  imageUrls!: string[];
  status!: PrescriptionStatus;
  reviewedById?: string;
  reviewedAt?: string; // ISO 8601
  notes?: string;
  createdAt!: string; // ISO 8601
}
