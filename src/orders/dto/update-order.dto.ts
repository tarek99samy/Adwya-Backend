import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

/**
 * Limited updates: branch/address/payment/prescription are not editable after
 * checkout — those require a cancel + new order. Currently this DTO exists
 * mostly for the customer-facing "cancel" flow, which writes `cancelReason`
 * and `cancelledAt` server-side. Status changes go through dedicated
 * transition endpoints, not this generic PATCH.
 */
export class UpdateOrderDto extends PartialType(
  OmitType(CreateOrderDto, [
    'branchId',
    'addressId',
    'paymentMethodId',
    'prescriptionImageUrls',
    'couponCode',
    'deliveryLatitude',
    'deliveryLongitude',
    'deliveryNote',
  ] as const),
) {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;
}
