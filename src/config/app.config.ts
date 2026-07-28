import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Min, validateSync } from 'class-validator';

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

  // JWT — split into access + refresh so we can rotate them independently.
  // Optional at config layer; AuthModule supplies dev fallbacks so the app
  // boots even when secrets aren't set (DB-less dev mode, tests).
  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

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
  return validated;
}
