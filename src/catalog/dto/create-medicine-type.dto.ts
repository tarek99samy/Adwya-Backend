import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMedicineTypeDto {
  @IsString()
  @MaxLength(60)
  name!: string;
}
