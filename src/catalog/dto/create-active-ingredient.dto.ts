import { IsString, MaxLength } from 'class-validator';

export class CreateActiveIngredientDto {
  @IsString()
  @MaxLength(160)
  name!: string;
}
