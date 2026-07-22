import { OmitType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserType } from '../../common/enums';
import { IsEgyptianPhone } from '../../common/validators';

export class CreateUserDto {
  @IsString()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @IsEnum(UserType)
  @IsOptional()
  userType?: UserType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** Customer-facing self-registration: doesn't allow choosing role or active flag. */
export class RegisterCustomerDto extends OmitType(CreateUserDto, [
  'userType',
  'isActive',
] as const) {}
