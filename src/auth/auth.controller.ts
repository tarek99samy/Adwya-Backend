import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import {
  RefreshTokenDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto) {
    return this.authService.registerCustomer(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.phone, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out' };
  }

  /**
   * Phase-1 forgot-password stub: phone → token. SMS/email wired in Phase 4.1.
   * Returning the token lets the integration be tested end-to-end without an
   * SMS provider.
   */
  @Public()
  @Post('verify-user')
  @HttpCode(HttpStatus.OK)
  verifyUser(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.phone);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset' };
  }

  /** Sanity-check the global JwtAuthGuard wiring. Requires a valid token. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user);
  }
}
