import { PartialType } from '@nestjs/mapped-types';
import { CreateMedicineImageDto } from './create-medicine-image.dto';

export class UpdateMedicineImageDto extends PartialType(CreateMedicineImageDto) {}
