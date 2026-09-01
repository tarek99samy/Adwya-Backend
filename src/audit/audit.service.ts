import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditLogFilterDto } from './dto/audit-log-filter.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Audit trail, newest first. Read-only: entries are never edited or deleted. */
  async findAll(filter: AuditLogFilterDto) {
    const { page = 1, limit = 50 } = filter;

    const where: Prisma.AuditLogWhereInput = {
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.createdFrom || filter.createdTo
        ? {
            createdAt: {
              ...(filter.createdFrom ? { gte: new Date(filter.createdFrom) } : {}),
              ...(filter.createdTo ? { lte: new Date(filter.createdTo) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, fullName: true, phone: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /** Full history for one entity — the "who changed this refund" view. */
  async findForEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, fullName: true } } },
    });
  }
}
