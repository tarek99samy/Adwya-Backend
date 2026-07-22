import { PartialType } from '@nestjs/mapped-types';
import { OmitType } from '@nestjs/mapped-types';
import { CreatePharmacyWarehouseDto } from './create-pharmacy-warehouse.dto';

export class UpdatePharmacyWarehouseDto extends PartialType(
  OmitType(CreatePharmacyWarehouseDto, ['pharmacyId'] as const),
) {}
