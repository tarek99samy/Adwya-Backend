import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { DecideRefundDto } from './dto/decide-refund.dto';
import { RefundFilterDto } from './dto/refund-filter.dto';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { Audit } from '../audit/audit.decorator';
import { RequiredPermissions } from '../rbac/decorators/required-permissions.decorator';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/**
 * Admin-only. Every route is permission-gated rather than relying on
 * `userType === ADMIN`, so refund authority can be delegated to a support
 * profile without handing over the whole admin role.
 */
@Controller('refunds')
@UseGuards(PermissionGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @RequiredPermissions('refunds.create')
  @Audit({ entityType: 'Refund', action: 'CREATE' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRefundDto) {
    return this.refundsService.create(user.id, dto);
  }

  @Get()
  @RequiredPermissions('refunds.read')
  findAll(@Query() filter: RefundFilterDto) {
    return this.refundsService.findAll(filter);
  }

  @Get(':id')
  @RequiredPermissions('refunds.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.refundsService.findOne(id);
  }

  /** PENDING -> APPROVED -> COMPLETED, or -> REJECTED. */
  @Patch(':id')
  @RequiredPermissions('refunds.approve')
  @Audit({ entityType: 'Refund', action: 'STATUS_CHANGE' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRefundDto,
  ) {
    return this.refundsService.decide(user.id, id, dto);
  }
}
