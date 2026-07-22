import { BranchStatus } from '../../common/enums';

export class PharmacyBranchResponseDto {
  id!: string;
  pharmacyId!: string;
  name!: string;
  licenseNumber!: string;
  status!: BranchStatus;
  phone!: string;
  whatsappNumber?: string | null;
  addressText!: string;
  latitude!: string;
  longitude!: string;
  deliveryRadiusMeters!: number;
  openingHours?: Record<string, unknown> | null;
  ratingAvg!: string;
  ratingCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
