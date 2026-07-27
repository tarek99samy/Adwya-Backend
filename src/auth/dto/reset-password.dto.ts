// import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class VerifyUserDto {
  // @ApiProperty({ example: 'user@example.com', description: 'The email of the user to verify' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class VerifyQuestionDto {
  // @ApiProperty({ example: 'user@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @ApiProperty({ example: 'MyAnswer' })
  @IsNotEmpty()
  @IsString()
  answer: string;
}

export class ResetPasswordDto {
  // @ApiProperty({ example: 'user@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @ApiProperty({ example: 'newStrongPassword123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}
