import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreateDeliveryZoneDto } from './create-delivery-zone.dto';

export class UpdateDeliveryZoneDto extends PartialType(
  OmitType(CreateDeliveryZoneDto, ['branchId'] as const),
) {}
