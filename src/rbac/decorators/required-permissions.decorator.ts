import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Mark a route (or controller) as requiring all of the given permission codes.
 * Apply alongside `@UseGuards(PermissionGuard)`. The guard pulls the effective
 * permission set off `req.user.permissionCodes` (populated by JwtAuthGuard)
 * and checks subset.
 */
export const RequiredPermissions = (...codes: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, codes);
