import { IsString, MaxLength } from 'class-validator';

export class CreateDosageUnitDto {
  @IsString()
  @MaxLength(40)
  name!: string;
}
