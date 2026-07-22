import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MedicineActiveIngredientInputDto {
  @IsUUID()
  activeIngredientId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  strength?: string;
}

export class CreateMedicineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  nameAr?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  genericName?: string;

  @IsUUID()
  @IsOptional()
  brandId?: string;

  @IsUUID()
  @IsOptional()
  manufacturerId?: string;

  @IsUUID()
  @IsOptional()
  medicineTypeId?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsUUID()
  @IsOptional()
  dosageUnitId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  strength?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  barcode?: string;

  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @IsBoolean()
  @IsOptional()
  isControlled?: boolean;

  // Many-to-many active ingredients (combo drugs). Optional — a simple
  // single-ingredient medicine just leaves this empty.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ValidateNested({ each: true })
  @Type(() => MedicineActiveIngredientInputDto)
  activeIngredients?: MedicineActiveIngredientInputDto[];
}
