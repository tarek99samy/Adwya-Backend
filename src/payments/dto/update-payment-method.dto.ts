import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePaymentMethodDto } from './create-payment-method.dto';

/**
 * Codes are immutable per admin policy. If a method needs to be re-keyed
 * (e.g. a provider is re-branded), the operator should create a new
 * `PaymentMethod` and migrate references, not edit the existing code in
 * place — codes show up in audit logs, payment records, and provider
 * routing tables.
 */
export class UpdatePaymentMethodDto extends PartialType(
  OmitType(CreatePaymentMethodDto, ['code'] as const),
) {}
