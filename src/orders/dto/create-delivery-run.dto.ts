import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Assignment record: branch staff allocates a courier (PharmacyStaff with
 * `role = COURIER`) to an order. `pickedUpAt` and `deliveredAt` are set on
 * courier-app events, not on creation. Courier GPS pings (`currentLat/Lng`)
 * should be throttled — see `domain-notes.md` §4.
 */
export class CreateDeliveryRunDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  courierStaffId!: string;

  // Optional initial GPS fix. Production traffic shouldn't populate this
  // here — it's set via the courier app after pickup.
  @IsOptional()
  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  currentLatitude?: number;

  @IsOptional()
  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  currentLongitude?: number;
}
