import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global JWT guard. Short-circuits for routes marked `@Public()`. For
 * protected routes, delegates to passport-jwt which invokes JwtStrategy.validate
 * (which attaches the AuthenticatedUser to req.user).
 *
 * We keep this thin on purpose: any extra authorization lives in PermissionGuard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? new UnauthorizedException(err.message)
        : new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
