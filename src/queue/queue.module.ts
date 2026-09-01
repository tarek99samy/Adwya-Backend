import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { redisConnectionOptions } from '../redis/redis-connection';

/** Every queue name in the system. Import these rather than typing strings. */
export const QUEUE_NOTIFICATIONS = 'notifications';

/**
 * BullMQ root configuration.
 *
 * BullMQ is a library, not a service: it runs inside this Node process and
 * uses Redis as its store. "Running it in Docker" means running a second
 * container from the same image with `npm run worker` — see `worker.ts` and
 * the `worker` service in docker-compose.yml.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          ...redisConnectionOptions(config),
          // BullMQ requires this to be null: it uses blocking commands
          // (BRPOPLPUSH) that must wait indefinitely, and ioredis would
          // otherwise abort them after N retries. BullMQ forces it for a
          // blocking connection anyway, but stating it keeps the constraint
          // visible if this ever becomes a pre-built ioredis instance, where
          // BullMQ throws instead of correcting it.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          // Keep a short tail for debugging without letting Redis grow forever.
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
