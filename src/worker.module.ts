import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/app.config';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsProcessor } from './notifications/notifications.processor';

/**
 * The worker process.
 *
 * Deliberately does NOT import AppModule: no controllers, no HTTP server, no
 * global JwtAuthGuard. It holds only what a background job needs — config,
 * Prisma, the queue connection, and the processors. That keeps a worker
 * container from accidentally serving traffic and keeps its memory footprint
 * and boot time small.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    QueueModule,
  ],
  providers: [NotificationsProcessor],
})
export class WorkerModule {}
