import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { UserResponseDto } from '../users/dto/user.response-dto';
import {
  InvalidCredentialsException,
  UserNotFoundException,
} from '../common/exceptions/auth.exceptions';
import { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';
import { AccessTokenPayload } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_BYTES = 48;
const RESET_TOKEN_BYTES = 32;

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access-token TTL in seconds
}

export interface AuthResult extends AuthTokenPair {
  user: UserResponseDto;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ───────────────────────────── signup / login ─────────────────────────────

  async registerCustomer(dto: SignupDto): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      phone: dto.phone,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
    });
    this.logger.log(`Customer registered: ${user.phone}`);
    return this.issueTokens(user.id, toResponse(user));
  }

  async login(phone: string, password: string): Promise<AuthResult> {
    const user = await this.usersService.findByPhone(phone);
    if (!user || !user.passwordHash) {
      // Don't leak whether the phone exists — same error either way.
      throw new InvalidCredentialsException();
    }
    if (!user.isActive) throw new InvalidCredentialsException();

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsException();

    this.logger.log(`Login: ${user.phone}`);
    return this.issueTokens(user.id, toResponse(user));
  }

  // ───────────────────────────── refresh ─────────────────────────────

  async refresh(refreshToken: string): Promise<AuthTokenPair> {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new InvalidCredentialsException();
    }

    // Rotation: mark old revoked, issue new pair.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(row.userId);
    if (!user || !user.isActive) throw new InvalidCredentialsException();

    return this.persistAndSignRefresh(user.id, toResponse(user));
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    // Idempotent: revokeAt = now even if already revoked, no-op if absent.
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  // ───────────────────────────── forgot-password ─────────────────────────────

  /**
   * Phase-1 stub: phone → mint a one-time reset token. In production this
   * would SMS/email the token via the notifications service (Phase 4.1).
   * For now we return it in the response so the integration is testable
   * end-to-end without an SMS provider wired up.
   */
  async requestPasswordReset(phone: string): Promise<{ resetToken: string }> {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new UserNotFoundException();

    const resetToken = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const ttlMin =
      parseDurationToMinutes(
        this.config.get<string>('PASSWORD_RESET_EXPIRES_IN') ?? '15m',
      ) ?? 15;
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt: new Date(Date.now() + ttlMin * 60_000),
      },
    });
    this.logger.log(`Reset token issued for ${user.phone}`);
    return { resetToken };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new ForbiddenException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all outstanding refresh tokens so a stolen phone+token
      // can't keep an attacker logged in after the password change.
      this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logger.log(`Password reset for user ${row.userId}`);
  }

  // ───────────────────────────── me ─────────────────────────────

  async getMe(user: AuthenticatedUser): Promise<UserResponseDto> {
    const fresh = await this.usersService.findById(user.id);
    if (!fresh) throw new NotFoundException('User not found');
    return toResponse(fresh);
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private async issueTokens(
    userId: string,
    userDto: UserResponseDto,
  ): Promise<AuthResult> {
    const pair = await this.persistAndSignRefresh(userId, userDto);
    return { ...pair, user: userDto };
  }

  private async persistAndSignRefresh(
    userId: string,
    userDto: UserResponseDto,
  ): Promise<AuthTokenPair> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshTtl =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '14d';

    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: 'access' } satisfies AccessTokenPayload,
      { expiresIn: accessTtl as unknown as number },
    );

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const refreshMinutes = parseDurationToMinutes(refreshTtl) ?? 60 * 24 * 14;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshMinutes * 60_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: parseDurationToSeconds(accessTtl) ?? 900,
    };
  }
}

function toResponse(user: {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  userType: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserResponseDto {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    userType: user.userType as UserResponseDto['userType'],
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashToken(token: string): string {
  // bcrypt-compare isn't appropriate for high-entropy tokens; SHA-256 is
  // fine because the input space is 256+ bits of randomness.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(token).digest('hex');
}

function parseDurationToMinutes(spec: string): number | undefined {
  const m = /^(\d+)\s*(s|m|h|d)?$/.exec(spec.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  switch (m[2] ?? 'm') {
    case 's':
      return n / 60;
    case 'm':
      return n;
    case 'h':
      return n * 60;
    case 'd':
      return n * 60 * 24;
  }
  return undefined;
}

function parseDurationToSeconds(spec: string): number | undefined {
  const minutes = parseDurationToMinutes(spec);
  return minutes === undefined ? undefined : Math.round(minutes * 60);
}
