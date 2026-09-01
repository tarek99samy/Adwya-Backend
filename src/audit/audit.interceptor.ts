import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_KEY, type AuditMetadata } from './audit.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/** Never write these into the audit trail, whatever shape the payload takes. */
const REDACTED_KEYS = new Set([
  'password',
  'ownerPassword',
  'newPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
  'signature',
]);

/**
 * Writes an `AuditLog` row for handlers marked with `@Audit(...)`.
 *
 * Opt-in rather than blanket: auditing every mutation would bury the entries
 * that matter (refunds, approvals, stock adjustments, status changes) under a
 * flood of cart edits.
 *
 * The write happens after the handler succeeds and is deliberately
 * fire-and-forget — an audit failure must never turn a successful refund into
 * a 500 for the caller.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
    }>();

    const actorId = req.user?.id ?? null;
    const before = redact(req.body ?? {});

    return next.handle().pipe(
      tap((result) => {
        // Prefer the id the handler actually produced; fall back to the path
        // parameter for deletes, which return no entity.
        const entityId =
          (isRecord(result) && typeof result.id === 'string' ? result.id : undefined) ??
          req.params?.[meta.idParam ?? 'id'] ??
          'unknown';

        void this.write({
          actorId,
          entityType: meta.entityType,
          entityId,
          action: meta.action,
          beforeData: before,
          afterData: redact(result),
        });
      }),
    );
  }

  private async write(entry: {
    actorId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    beforeData: unknown;
    afterData: unknown;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          beforeData: entry.beforeData as never,
          afterData: entry.afterData as never,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write audit entry for ${entry.entityType}:${entry.entityId}: ${(err as Error).message}`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-copies a payload with sensitive keys replaced. Also drops anything that
 * would not survive JSON (Dates become strings, Decimals become numbers), so
 * the column always holds valid JSON.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // Prisma Decimal and similar wrappers.
    if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
      return Number(value);
    }
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : redact(inner, depth + 1);
    }
    return out;
  }
  return value;
}
