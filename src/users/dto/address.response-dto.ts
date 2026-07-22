export class AddressResponseDto {
  id!: string;
  userId!: string;
  label!: string;
  building?: string | null;
  street!: string;
  area!: string;
  city!: string;
  governorate!: string;
  latitude!: string; // serialized as string to preserve Decimal precision
  longitude!: string;
  isDefault!: boolean;
  createdAt!: Date;
}
