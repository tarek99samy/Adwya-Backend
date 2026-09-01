import { Injectable } from '@nestjs/common';

/**
 * Minimal in-process Prometheus exposition.
 *
 * Deliberately not `prom-client`: this needs four metrics, and a dependency
 * that registers default Node collectors brings its own footprint. If the
 * metric set grows past a handful, swap this for prom-client rather than
 * growing a homegrown registry.
 *
 * Counters live in memory, so they reset when the process restarts and are
 * per-instance. Prometheus handles both — `rate()` tolerates resets, and
 * scraping each replica separately is the normal pattern.
 */
@Injectable()
export class MetricsService {
  private readonly requestTotal = new Map<string, number>();
  private readonly requestDurationSum = new Map<string, number>();
  private readonly startedAt = Date.now();

  /**
   * Records one finished request.
   *
   * `route` must be the Nest route pattern (`/orders/:id`), never the resolved
   * path — one label per order id would blow up cardinality and take the
   * scraper with it.
   */
  record(method: string, route: string, status: number, durationMs: number): void {
    const key = `${method}|${route}|${status}`;
    this.requestTotal.set(key, (this.requestTotal.get(key) ?? 0) + 1);
    this.requestDurationSum.set(key, (this.requestDurationSum.get(key) ?? 0) + durationMs);
  }

  render(): string {
    const lines: string[] = [];

    lines.push('# HELP adwya_http_requests_total Total HTTP requests handled.');
    lines.push('# TYPE adwya_http_requests_total counter');
    for (const [key, count] of this.requestTotal) {
      const [method, route, status] = key.split('|');
      lines.push(
        `adwya_http_requests_total{method="${method}",route="${escape(route)}",status="${status}"} ${count}`,
      );
    }

    lines.push('# HELP adwya_http_request_duration_ms_sum Summed request duration in milliseconds.');
    lines.push('# TYPE adwya_http_request_duration_ms_sum counter');
    for (const [key, sum] of this.requestDurationSum) {
      const [method, route, status] = key.split('|');
      lines.push(
        `adwya_http_request_duration_ms_sum{method="${method}",route="${escape(route)}",status="${status}"} ${sum.toFixed(1)}`,
      );
    }

    lines.push('# HELP adwya_process_uptime_seconds Seconds since this instance started.');
    lines.push('# TYPE adwya_process_uptime_seconds gauge');
    lines.push(`adwya_process_uptime_seconds ${Math.round((Date.now() - this.startedAt) / 1000)}`);

    const memory = process.memoryUsage();
    lines.push('# HELP adwya_process_heap_bytes Node heap in use.');
    lines.push('# TYPE adwya_process_heap_bytes gauge');
    lines.push(`adwya_process_heap_bytes ${memory.heapUsed}`);

    return lines.join('\n') + '\n';
  }
}

/** Escapes the characters Prometheus treats specially inside a label value. */
function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
