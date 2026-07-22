import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // We register the global pipe explicitly below, but auto-validation
    // makes early DTO errors fail loud at request time too.
    bufferLogs: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 instead of silent drop
      transform: true, // enable type coercion from query/path params
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Health endpoint: useful as a container probe; doesn't depend on the DB
  // so it returns 200 even before migrations run.
  app.getHttpAdapter().get('/healthz', (_req: unknown, res: { json: (b: unknown) => void }) => {
    res.json({ status: 'ok' });
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Adwya backend listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
