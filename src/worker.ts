import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Background worker entrypoint (`npm run worker`, or the `worker` service in
 * docker-compose).
 *
 * `createApplicationContext` boots the DI container without an HTTP server —
 * BullMQ processors start themselves once their module is instantiated.
 *
 * Scale by running more of these; BullMQ distributes jobs across every worker
 * connected to the same Redis, so `docker compose up -d --scale worker=3` is
 * the whole scaling story.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Finish in-flight jobs before exiting, so a deploy does not drop work.
  app.enableShutdownHooks();

  Logger.log('Adwya worker started', 'Worker');

  const shutdown = (signal: string) => {
    Logger.log(`Received ${signal}, draining...`, 'Worker');
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  Logger.error(`Worker bootstrap failed: ${message}`, 'Worker');
  process.exit(1);
});
