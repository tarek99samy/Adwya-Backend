import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IsEgyptianPhone } from '../../common/validators';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
