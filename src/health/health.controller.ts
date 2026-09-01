import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Kubernetes-style probes.
 *
 * `/healthz` (liveness) answers as long as the process is up — it must not
 * touch dependencies, or a brief DB blip would get the container killed and
 * restarted for no reason.
 *
 * `/readyz` (readiness) reports whether this instance can actually serve
 * traffic. A failing dependency takes the pod out of the load balancer but
 * leaves it running.
 */
// Version-neutral: an orchestrator probing /healthz should not have to know
// or track which API version is current.
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('healthz')
  @Public()
  liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('readyz')
  @Public()
  @HttpCode(HttpStatus.OK)
  async readiness(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.redis.ping()]);

    // Redis is degraded-but-serving: notifications queue up and GPS ticks fall
    // back to direct writes, but orders still work. Only the database is fatal.
    const ready = database;

    if (!ready) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: ready ? (redis ? 'ok' : 'degraded') : 'unavailable',
      checks: {
        database: database ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
