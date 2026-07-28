import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsEgyptianPhone } from '../../common/validators';

/**
 * Customer self-registration. Mirrors RegisterCustomerDto in src/users/dto
 * (which strips userType + isActive) — kept here so the auth DTO file is
 * self-contained for API consumers reading /auth/signup.
 */
export class SignupDto {
  @IsString()
  @IsNotEmpty()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;
}
