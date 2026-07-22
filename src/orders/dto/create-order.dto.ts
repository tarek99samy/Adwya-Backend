import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Customer checkout payload. The server:
 *   1. Reads the user's current `Cart` (must be `branchId`-scoped to one branch).
 *   2. Recomputes prices, availability, and totals from `BranchInventory`.
 *   3. Runs the whole flow inside a `$transaction` (see `domain-notes.md` §1).
 *
 * Clients must NOT send prices, totals, line items, or prescription status —
 * they are derived server-side. What the client provides: delivery target,
 * payment method, optional coupon, and (for Rx carts) the uploaded Rx image
 * URLs.
 */
export class CreateOrderDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  addressId!: string;

  @IsUUID()
  paymentMethodId!: string;

  // URLs of pre-uploaded prescription images. Required when the cart contains
  // any `requiresPrescription` medicine; the order enters with
  // `prescriptionStatus = PENDING_REVIEW` and cannot move past
  // `PENDING_CONFIRMATION` until a pharmacist reviews.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  prescriptionImageUrls?: string[];

  // Optional coupon code. Validated server-side (active, in window,
  // minOrderAmount, maxUses, maxUsesPerUser). Limited-use coupon bookkeeping
  // happens inside the checkout transaction to prevent race conditions.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  // Delivery lat/lng snapshot. Defaults to the chosen address's lat/lng
  // server-side; the client may override for "deliver to my GPS" flows.
  @IsOptional()
  @IsLatitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  deliveryLatitude?: number;

  @IsOptional()
  @IsLongitude()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  deliveryLongitude?: number;

  // Free-form delivery note from the customer (gate code, landmark, etc.).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}
