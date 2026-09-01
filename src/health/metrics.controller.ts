import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape target.
 *
 * Version-neutral and unversioned: a scraper should not have to track API
 * versions, and this is not part of the public product surface.
 *
 * `@Public()` because Prometheus carries no bearer token. In production this
 * should be reachable only from inside the cluster — expose it on the internal
 * network, not through the public ingress.
 */
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(): string {
    return this.metrics.render();
  }
}
