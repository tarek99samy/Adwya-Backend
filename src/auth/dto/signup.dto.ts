// import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MinLength, ValidateNested } from 'class-validator';

class VerificationDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsNotEmpty()
  answer: string;
}

export class SignupDto {
  // @ApiProperty({ example: 'Tarek Samy' })
  @IsString()
  @MinLength(3)
  name: string;

  // @ApiProperty({ example: 'test@test.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @ApiProperty({ example: 'P@ssw0rd' })
  @IsString()
  @MinLength(8)
  password: string;

  // @ApiProperty({ example: { question: 'What is your favorite color?', answer: 'blue' } })
  @ValidateNested()
  @Type(() => VerificationDto)
  verification: VerificationDto;
}
