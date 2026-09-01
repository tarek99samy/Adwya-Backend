import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Producer side only — the processor lives in `WorkerModule` so the API never
 * consumes its own jobs. Global so any feature module can enqueue without
 * importing this.
 */
@Global()
@Module({
  imports: [QueueModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
