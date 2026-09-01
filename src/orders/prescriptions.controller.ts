import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionFilterDto } from './dto/prescription-filter.dto';
import { ReviewPrescriptionDto } from './dto/review-prescription.dto';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import { Audit } from '../audit/audit.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  /** Pharmacist review queue for one branch, oldest first. */
  @Get('branch/:branchId')
  findForBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() filter: PrescriptionFilterDto,
  ) {
    return this.prescriptionsService.findForBranch(user.id, branchId, filter);
  }

  /**
   * Approve or reject. Rejection also kills the order and restores stock, so
   * this is restricted to PHARMACIST staff at the order's own branch.
   */
  @Patch(':id')
  @Audit({ entityType: 'Prescription', action: 'REVIEW' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPrescriptionDto,
  ) {
    return this.prescriptionsService.review(id, user.id, dto);
  }
}
