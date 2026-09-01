import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.module';
import { NOTIFY_JOB, type NotifyJobData } from './notification-jobs';
import type { NotificationFilterDto } from './dto/notification-filter.dto';

/**
 * How long a producer waits on Redis before abandoning a notification.
 *
 * Not a nicety. BullMQ forces `maxRetriesPerRequest: null` on its connection
 * (blocking commands must be able to wait indefinitely), which means ioredis
 * buffers `queue.add` in its offline queue while Redis is unreachable and the
 * promise never settles - it neither resolves nor rejects. An `await` on it
 * inside a request handler therefore hangs the response forever rather than
 * throwing, and no try/catch can see it.
 *
 * That turned a Redis outage into: order committed, response never sent,
 * customer retries, customer double-orders. A bounded wait is what makes
 * "Redis is optional" actually true.
 */
const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Producer side. Enqueues notification jobs and serves the in-app inbox.
 *
 * `enqueue` never throws and always settles: it is called from inside request
 * handlers right after an order is placed or a status changes, and a Redis
 * hiccup must not turn a successful checkout into a 500 - or, worse, into a
 * request that never answers. A dropped notification is recoverable; a failed
 * or hung order is not.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async enqueue(data: NotifyJobData): Promise<void> {
    try {
      await withTimeout(
        this.queue.add(NOTIFY_JOB, data, {
          // Collapses duplicates: the same template for the same user within the
          // same second is one job, so a double-clicked transition does not
          // notify twice.
          jobId: `${data.userId}:${data.templateCode}:${Math.floor(Date.now() / 1000)}`,
        }),
        ENQUEUE_TIMEOUT_MS,
        `enqueue ${data.templateCode}`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not enqueue ${data.templateCode} for ${data.userId}: ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // In-app inbox
  // -------------------------------------------------------------------------

  async findMine(userId: string, filter: NotificationFilterDto) {
    const { page = 1, limit = 20 } = filter;

    const where = {
      userId,
      ...(filter.isRead === undefined ? {} : { isRead: filter.isRead }),
      ...(filter.type ? { type: filter.type } : {}),
    };

    const [data, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, meta: { total, page, limit, unread } };
  }

  /** Marks the given notifications read, or all of them when no ids are given. */
  async markRead(userId: string, ids?: string[]) {
    const result = await this.prisma.notification.updateMany({
      // Scoped to the caller, so passing someone else's id is a no-op rather
      // than a leak.
      where: { userId, ...(ids?.length ? { id: { in: ids } } : { isRead: false }) },
      data: { isRead: true },
    });

    return { updated: result.count };
  }
}

/**
 * Resolves with `promise`, or rejects once `ms` has passed.
 *
 * The abandoned promise is deliberately given a no-op catch: ioredis may settle
 * it minutes later when Redis returns, and by then nobody is listening, so
 * without this it would surface as an unhandled rejection and take the process
 * down under Node's default policy.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  promise.catch(() => undefined);

  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}
