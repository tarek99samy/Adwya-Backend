import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserType } from '@prisma/client';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../../rbac/decorators/current-user.decorator';

export interface AccessTokenPayload {
  sub: string; // user id
  typ: 'access';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret-rotate-me',
    });
  }

  /**
   * Passport calls validate() after the JWT signature + expiry are verified.
   * We additionally re-fetch the user so a deactivated/deleted account can't
   * keep using a token issued before the change. We also load the effective
   * permission set once here so downstream guards (PermissionGuard) don't
   * have to round-trip to the DB on every request.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Wrong token type');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }
    const permissionCodes = await this.usersService.loadPermissions(user.id);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      userType: user.userType as UserType,
      permissionCodes,
    };
  }
}
