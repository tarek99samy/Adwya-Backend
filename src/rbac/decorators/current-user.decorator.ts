import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserType } from '../../common/enums';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  email?: string | null;
  fullName: string;
  userType: UserType;
  permissionCodes: Set<string>;
}

/**
 * Pulls the authenticated user (attached to req.user by JwtStrategy) out of
 * the request. Use as a controller parameter decorator:
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * Pass a key to extract one field: `@CurrentUser('id')`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
