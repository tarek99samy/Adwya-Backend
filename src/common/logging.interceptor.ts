import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';
import { MetricsService } from '../health/metrics.service';

/**
 * One structured line per request.
 *
 * The client may supply `X-Request-Id` for correlation across services; when it
 * does not, we mint one and echo it back on the response so a user can quote it
 * in a bug report and it can be found in the logs.
 *
 * Emitted as JSON in production and a compact human line in development —
 * log aggregators want the former, a developer watching a terminal wants the
 * latter.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly asJson = process.env.NODE_ENV === 'production';

  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const res = http.getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const startedAt = process.hrtime.bigint();

    const emit = (status: number) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      // Metrics use the ROUTE PATTERN, not the resolved path: one label per
      // order id would explode Prometheus cardinality.
      const routePattern =
        (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      this.metrics.record(req.method, routePattern, status, durationMs);
      const entry = {
        requestId,
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.url,
        status,
        durationMs: Math.round(durationMs * 10) / 10,
        // Populated by JwtStrategy; absent on public routes.
        userId: req.user?.id ?? null,
        ip: req.ip,
      };

      const line = this.asJson
        ? JSON.stringify(entry)
        : `${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms${
            entry.userId ? ` user=${entry.userId}` : ''
          } req=${requestId.slice(0, 8)}`;

      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    };

    return next.handle().pipe(
      tap({
        next: () => emit(res.statusCode),
        // On a thrown error the exception filter has not run yet, so
        // res.statusCode is still 200 — read the exception's own status.
        error: (err: { status?: number; statusCode?: number }) =>
          emit(err?.status ?? err?.statusCode ?? 500),
      }),
    );
  }
}
