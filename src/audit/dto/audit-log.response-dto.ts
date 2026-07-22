export class AuditLogResponseDto {
  id!: string;
  actorId?: string | null;
  entityType!: string;
  entityId!: string;
  action!: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  createdAt!: Date;
}
