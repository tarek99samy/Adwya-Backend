import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequiredPermissions } from '../rbac/decorators/required-permissions.decorator';

/** Read-only. Audit entries are never edited or deleted through the API. */
@Controller('admin/audit')
@UseGuards(PermissionGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequiredPermissions('audit.read')
  findAll(@Query() filter: AuditLogFilterDto) {
    return this.audit.findAll(filter);
  }

  @Get(':entityType/:entityId')
  @RequiredPermissions('audit.read')
  findForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.audit.findForEntity(entityType, entityId);
  }
}
