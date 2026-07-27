// import type { Response } from 'express';
// import { Body, Controller, HttpCode, HttpStatus, Post, Get, Req, UseGuards, Res, Logger } from '@nestjs/common';
// import { ThrottlerGuard } from '@nestjs/throttler';
// import { randomUUID } from 'crypto';
// import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { SignupDto } from './dto/signup.dto';
// import { VerifyUserDto, VerifyQuestionDto } from './dto/reset-password.dto';
// import { ResetPasswordDto } from './dto/reset-password.dto';
// import AuthGuard from './auth.guard';

// @Controller('auth')
// @UseGuards(ThrottlerGuard)
// export class AuthController {
//   private logger = new Logger(AuthController.name);
//   constructor(private authService: AuthService) {}

//   @Get('me')
//   @UseGuards(AuthGuard)
//   getMe(@Req() req: { email: string }) {
//     return this.authService.getMe(req.email);
//   }

//   @Get('csrf-token')
//   @HttpCode(HttpStatus.OK)
//   @UseGuards(AuthGuard)
//   getCsrfToken(@Res({ passthrough: true }) res: Response) {
//     this.logger.log(`Generating new CSRF token`);
//     const csrfToken = randomUUID();
//     res.cookie('csrf_token', csrfToken, { httpOnly: false, secure: false, sameSite: 'strict' });
//     return { csrfToken };
//   }

//   @Post('login')
//   @HttpCode(HttpStatus.OK)
//   async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
//     const { access_token, user } = await this.authService.login(dto.email, dto.password);
//     res.cookie('access_token', `Bearer ${access_token}`, { httpOnly: true, secure: false, sameSite: 'lax' });

//     const csrfToken = randomUUID();
//     res.cookie('csrf_token', csrfToken, { httpOnly: false, secure: false, sameSite: 'strict' });

//     return { user, csrfToken };
//   }

//   @Post('signup')
//   @HttpCode(HttpStatus.CREATED)
//   async signUp(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
//     const { access_token, user } = await this.authService.signUp(dto);
//     res.cookie('access_token', `Bearer ${access_token}`, { httpOnly: true, secure: false, sameSite: 'lax' });

//     const csrfToken = randomUUID();
//     res.cookie('csrf_token', csrfToken, { httpOnly: false, secure: false, sameSite: 'strict' });

//     return { user, csrfToken };
//   }

//   @Post('verify-user')
//   @HttpCode(HttpStatus.OK)
//   async validateUser(@Body() dto: VerifyUserDto) {
//     return this.authService.validateUser(dto.email);
//   }

//   @Post('verify-question')
//   @HttpCode(HttpStatus.OK)
//   async validateQuestion(@Body() dto: VerifyQuestionDto) {
//     return this.authService.validateQuestion(dto.email, dto.answer);
//   }

//   @Post('reset-password')
//   @HttpCode(HttpStatus.OK)
//   async resetPassword(@Body() dto: ResetPasswordDto) {
//     return this.authService.resetPassword(dto.email, dto.newPassword);
//   }

//   @Post('logout')
//   @HttpCode(HttpStatus.OK)
//   logout(@Res({ passthrough: true }) res: Response) {
//     this.logger.log(`Logging out a user`);
//     res.clearCookie('access_token', { httpOnly: true });
//     res.clearCookie('csrf_token');
//     return { message: 'Logged out' };
//   }
// }
