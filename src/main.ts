import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { GlobalHttpExceptionFilter } from './common/exception-filter';
import { LoggingInterceptor } from './common/logging.interceptor';
import { MetricsService } from './health/metrics.service';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // We register the global pipe explicitly below, but auto-validation
    // makes early DTO errors fail loud at request time too.
    bufferLogs: false,
  });

  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // URI versioning: every route is served under /v1/*, so a future breaking
  // change can ship as /v2 without stranding installed mobile apps. Probes and
  // /metrics opt out via VERSION_NEUTRAL.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(cookieParser());
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  // Resolved through DI so the interceptor can hold MetricsService.
  app.useGlobalInterceptors(new LoggingInterceptor(app.get(MetricsService)));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 instead of silent drop
      transform: true, // enable type coercion from query/path params
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS: `*` is a development convenience only. In production the allowed
  // origins must be listed explicitly — a wildcard plus credentials would let
  // any site drive the API with a logged-in user's token.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && origins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must list the allowed origins when NODE_ENV=production.',
    );
  }

  app.enableCors({
    origin: origins.length > 0 ? origins : '*',
    credentials: origins.length > 0,
    exposedHeaders: ['X-Request-Id'],
  });

  // /healthz, /readyz and /metrics are served by their controllers (all
  // @Public() and VERSION_NEUTRAL), so they go through the normal pipeline.
  if (!isProduction || config.get<string>('ENABLE_DOCS') === 'true') {
    setupSwagger(app);
  }

  // Lets Nest run onModuleDestroy on SIGTERM so Prisma and Redis close cleanly.
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Adwya backend listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`API base path /v1 — docs at /api/docs`, 'Bootstrap');
}

// Catch any bootstrap failure (Prisma connect, port in use, etc.) and exit
// with a non-zero code instead of an unhandled rejection. Without this a
// missing Postgres would print a stack trace and leave the process hung.
bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  Logger.error(`Bootstrap failed: ${message}`, 'Bootstrap');
  process.exit(1);
});
