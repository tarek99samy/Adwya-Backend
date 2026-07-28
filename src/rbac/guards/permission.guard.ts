import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRED_PERMISSIONS_KEY,
} from '../decorators/required-permissions.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Per-route RBAC. Reads permission codes from `@RequiredPermissions(...)`
 * metadata and checks them against the user's effective permission set
 * (loaded once at login by AuthService via UsersService.loadPermissions).
 *
 * Deny-wins is applied at load time, not here — by the time we see the Set,
 * explicit denies have already removed inherited grants.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const granted = req.user?.permissionCodes ?? new Set<string>();
    const missing = required.filter((code) => !granted.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permissions: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
