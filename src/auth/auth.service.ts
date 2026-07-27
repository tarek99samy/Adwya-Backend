// import bcrypt from 'bcryptjs';
// import { Injectable, Logger } from '@nestjs/common';
// import { UsersService } from '../users/users.service';
// import { JwtService } from '@nestjs/jwt';
// import { User } from './../users/user.schema';
// import {
//   EmailAlreadyInUseException,
//   InvalidCredentialsException,
//   InvalidSecurityAnswerException,
//   PendingResetPasswordException,
//   UserNotFoundException,
// } from '../common/exceptions/auth.exceptions';

// @Injectable()
// export class AuthService {
//   private logger = new Logger(AuthService.name);
//   constructor(
//     private usersService: UsersService,
//     private jwtService: JwtService,
//   ) {}

//   async getMe(email: string): Promise<User | null> {
//     this.logger.log(`Fetching current user info for email: ${email}`);
//     const user = await this.usersService.findByEmail(email);

//     if (!user) {
//       this.logger.warn(`User not found during login attempt: ${email}`);
//       throw new InvalidCredentialsException();
//     }

//     this.logger.log(`Fetched current user info successfully for email: ${email}`);
//     return user;
//   }

//   async login(email: string, password: string): Promise<{ access_token: string; user: User }> {
//     this.logger.log(`Attempting login for email: ${email} and password: ${password}`);
//     const user = await this.usersService.findByEmail(email);

//     if (!user) {
//       this.logger.warn(`User not found during login attempt: ${email}`);
//       throw new InvalidCredentialsException();
//     }

//     if (user.status === 'pending-reset') {
//       this.logger.warn(`Login blocked for user with pending-reset status: ${email}`);
//       throw new PendingResetPasswordException();
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       this.logger.warn(`Password mismatch during login attempt for email: ${email}`);
//       throw new InvalidCredentialsException();
//     }

//     if (user.status !== 'active') {
//       await this.usersService.updateByEmail(email, { status: 'active' });
//       user.status = 'active';
//     }
//     this.logger.log(`Login successful for email: ${email}`);
//     return this.signToken(user);
//   }

//   async signUp(signUpDto: Partial<User>): Promise<{ access_token: string; user: User }> {
//     this.logger.log(`Signup attempt with data ${JSON.stringify(signUpDto)}`);
//     const existingUser = await this.usersService.findByEmail(signUpDto.email!).catch(() => null);

//     if (existingUser) {
//       this.logger.warn(`Email already in use during signup attempt: ${signUpDto.email}`);
//       throw new EmailAlreadyInUseException();
//     }

//     const user = await this.usersService.create(signUpDto);
//     this.logger.log(`Signup successful for email: ${signUpDto.email}`);
//     return this.signToken(user);
//   }

//   async validateUser(email: string): Promise<string> {
//     this.logger.log(`Validate user attempt for email: ${email}`);
//     const user = await this.usersService.findByEmail(email).catch(() => null);

//     if (!user) {
//       this.logger.warn(`User not found during Validate user attempt: ${email}`);
//       throw new UserNotFoundException();
//     }

//     await this.usersService.updateByEmail(email, { status: 'verified' });
//     this.logger.log(`User validated successfully for email: ${email}`);
//     return user.verification.question;
//   }

//   async validateQuestion(email: string, answer: string): Promise<User | null> {
//     this.logger.log(`Validate question attempt for email: ${email} and answer: ${answer}`);
//     const user = await this.usersService.findByEmail(email);

//     if (!user) {
//       this.logger.warn(`User not found during validate question for email: ${email}`);
//       throw new UserNotFoundException();
//     }

//     const isMatch = await bcrypt.compare(answer, user.verification.answer);
//     if (!isMatch) {
//       this.logger.warn(`Answer mismatch validate question for email: ${email}`);
//       throw new InvalidSecurityAnswerException();
//     }

//     await this.usersService.updateByEmail(email, { status: 'pending-reset' });
//     this.logger.log(`Answer validated sucessfully for email: ${email}`);
//     return user;
//   }

//   async resetPassword(email: string, newPassword: string): Promise<User> {
//     this.logger.log(`Reset password attempt for email: ${email} and newPassword: ${newPassword}`);
//     const user = await this.usersService.findByEmail(email);

//     if (!user) {
//       this.logger.warn(`User not found during reset password for email: ${email}`);
//       throw new UserNotFoundException();
//     }

//     const hashedPassword = await bcrypt.hash(newPassword, 10);
//     const updatedUser = await this.usersService.updateByEmail(user.email, { password: hashedPassword, status: 'active' });
//     this.logger.log(`Reset password sucessful for email: ${email}`);
//     return updatedUser;
//   }

//   private async signToken(user: User) {
//     this.logger.log(`Signing new token for email: ${user.email}`);
//     const payload = { name: user.name, email: user.email };
//     const access_token = await this.jwtService.signAsync(payload);
//     return { access_token, user };
//   }
// }
