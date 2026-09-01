import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Strongly-typed application configuration.
 * Anything that reads `process.env` outside of `main.ts` should import this
 * instead, so misconfiguration fails at boot rather than at request time.
 */
export class AppConfig {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  // Optional at the config layer: a missing DB URL is allowed so the app can
  // boot in a DB-less dev mode (DTO work, healthcheck, swagger). Prisma will
  // throw at $connect() time when the URL is actually needed.
  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  // Signs access tokens. Optional at config layer so the app boots in DB-less
  // dev mode and in tests; `requireProductionSecrets` below makes it mandatory
  // when NODE_ENV=production, because the dev fallback is a literal in this
  // repository and would let anyone mint a token for any user.
  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  // Reserved. Refresh tokens are opaque random bytes stored hashed in
  // `refresh_tokens`, not JWTs, so nothing signs with this today. Kept so the
  // variable does not change meaning if refresh tokens ever become JWTs.
  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN?: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string = '14d';

  @IsString()
  @IsOptional()
  PASSWORD_RESET_EXPIRES_IN?: string = '15m';

  // Redis configuration. Redis is optional at boot — RedisService logs a
  // warning and degrades to no-ops rather than crashing, so a Redis outage
  // cannot take checkout down with it. /readyz reports the real state.
  // REDIS_URL, when set, wins over the individual fields.
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_USERNAME?: string;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  REDIS_DB: number = 0;

  // Shared secret the payment provider signs webhook payloads with. Optional
  // at the config layer so the app boots without it in dev; mandatory in
  // production - the dev fallback is public, and anyone holding it can forge a
  // PAID callback for any order.
  @IsString()
  @IsOptional()
  PAYMENT_WEBHOOK_SECRET?: string;

  // Comma-separated list of allowed CORS origins. REQUIRED in production —
  // main.ts refuses to boot without it, because a wildcard plus credentials
  // would let any site drive the API with a logged-in user's token.
  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // Serve Swagger in production too. Off by default: the schema is a map of
  // the whole attack surface.
  @IsString()
  @IsOptional()
  ENABLE_DOCS?: string;

  // App-level URL used for absolute links (e.g. WhatsApp deep links).
  @IsUrl({ require_tld: false })
  @IsOptional()
  APP_PUBLIC_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const validated = plainToInstance(AppConfig, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${messages}`);
  }
  requireProductionSecrets(validated);
  return validated;
}

/**
 * Secrets that have a development fallback baked into the source.
 *
 * Those fallbacks are what let the app boot for DTO work and tests without a
 * .env, but they are literals in a repository - shipping with one is the same
 * as shipping with no secret at all. Rather than degrade silently, refuse to
 * start in production, the same way `main.ts` refuses to start without
 * CORS_ORIGINS.
 *
 * Only secrets that are actually used are listed. JWT_REFRESH_SECRET is not:
 * refresh tokens are opaque random bytes, so nothing signs with it.
 */
function requireProductionSecrets(config: AppConfig): void {
  if (config.NODE_ENV !== NodeEnv.Production) return;

  const missing = (
    [
      ['JWT_ACCESS_SECRET', config.JWT_ACCESS_SECRET],
      ['PAYMENT_WEBHOOK_SECRET', config.PAYMENT_WEBHOOK_SECRET],
    ] as const
  )
    .filter(([, value]) => !value || value.trim().length === 0)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      'These secrets must be set when NODE_ENV=production (they fall back to ' +
        `well-known development values otherwise): ${missing.join(', ')}.`,
    );
  }
}
