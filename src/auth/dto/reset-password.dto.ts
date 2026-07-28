import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsEgyptianPhone } from '../../common/validators';

/** First half of forgot-password: lookup by phone, returns a reset token. */
export class RequestPasswordResetDto {
  @IsNotEmpty()
  @IsString()
  @IsEgyptianPhone()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;
}

/** Second half: consume the reset token with a new password. */
export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

/** Body of POST /auth/refresh — the rotated refresh token. */
export class RefreshTokenDto {
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}
