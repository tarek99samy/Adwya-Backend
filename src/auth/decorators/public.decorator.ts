import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route (or controller) as not requiring authentication.
 * The global JwtAuthGuard short-circuits when this metadata is set,
 * which is what lets /auth/login, /auth/signup, /auth/refresh, and
 * /healthz stay reachable without a token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
