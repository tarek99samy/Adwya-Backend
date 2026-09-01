import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.module';
import { renderTemplate, type NotifyJobData } from './notification-jobs';

/**
 * Consumer side. Runs in the worker process, not the API.
 *
 * Today it renders the template and writes an in-app `Notification` row, which
 * needs no third-party credentials. Firebase push is an additional delivery
 * channel on top of the same row — see `deliverPush` below for the seam.
 *
 * Throwing from `process` makes BullMQ retry with the backoff configured in
 * QueueModule; exhausted jobs land in the failed set and are kept 24h.
 */
@Processor(QUEUE_NOTIFICATIONS, { concurrency: 5 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotifyJobData>): Promise<{ notificationId: string }> {
    const { userId, templateCode, type, variables } = job.data;

    const template = await this.prisma.notificationTemplate.findUnique({
      where: { code: templateCode },
    });
    if (!template) {
      // A missing template is a deploy problem, not a transient fault — retrying
      // will never fix it, so fail loudly once rather than three times.
      throw new Error(`Unknown notification template: ${templateCode}`);
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        templateId: template.id,
        title: renderTemplate(template.titleTemplate, variables),
        body: renderTemplate(template.bodyTemplate, variables),
        type,
      },
    });

    await this.deliverPush(userId, notification.title, notification.body);

    this.logger.log(`Notified ${userId}: ${templateCode}`);
    return { notificationId: notification.id };
  }

  /**
   * Firebase push delivery — deliberately not implemented yet.
   *
   * When it lands: read the user's `DeviceToken` rows, send via FCM, and write
   * a `NotificationLog` row per attempt. Delivery failure must NOT fail the
   * job — the in-app notification above is already persisted and is the
   * source of truth; push is best-effort on top of it.
   */
  private deliverPush(_userId: string, _title: string, _body: string): Promise<void> {
    return Promise.resolve();
  }
}
