// import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  // @ApiProperty({ example: 'test@test.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  // @ApiProperty({ example: 'P@ssw0rd' })
  @IsString()
  @MinLength(8)
  password: string;
}
