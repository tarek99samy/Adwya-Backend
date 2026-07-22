import { PartialType } from '@nestjs/mapped-types';
import { CreateDosageUnitDto } from './create-dosage-unit.dto';

export class UpdateDosageUnitDto extends PartialType(CreateDosageUnitDto) {}
