import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OnboardingService } from './onboarding.service';
import { RegisterPharmacyDto } from './dto/register-pharmacy.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { ReviewBranchDto } from './dto/review-branch.dto';
import { SetBranchStatusDto } from './dto/set-branch-status.dto';
import { Public } from '../auth/decorators/public.decorator';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { Audit } from '../audit/audit.decorator';
import { RequiredPermissions } from '../rbac/decorators/required-permissions.decorator';
import { CurrentUser } from '../rbac/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../rbac/decorators/current-user.decorator';

/** Pharmacy-side onboarding: registration, branches, staff. */
@Controller('pharmacies')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /**
   * Public self-service registration — this is how a pharmacy with no account
   * gets one. Throttled hard because it creates users unauthenticated.
   */
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterPharmacyDto) {
    return this.onboarding.registerPharmacy(dto);
  }

  /** An existing pharmacy opens another branch (OWNER/MANAGER). */
  @Post(':pharmacyId/branches')
  @HttpCode(HttpStatus.CREATED)
  createBranch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pharmacyId', ParseUUIDPipe) pharmacyId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.onboarding.createBranch(user.id, pharmacyId, dto);
  }

  @Post('branches/:branchId/staff')
  @HttpCode(HttpStatus.CREATED)
  addStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: AddStaffDto,
  ) {
    return this.onboarding.addStaff(user.id, branchId, dto);
  }

  @Get('branches/:branchId/staff')
  listStaff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.onboarding.listStaff(user.id, branchId);
  }
}

/**
 * Platform-admin side of onboarding. Permission-gated rather than keyed on
 * `userType === ADMIN`, so approval authority can be delegated to a
 * compliance profile without granting full admin.
 */
@Controller('admin/pharmacies')
@UseGuards(PermissionGuard)
export class AdminPharmaciesController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('branches/pending')
  @RequiredPermissions('pharmacies.approve')
  pending() {
    return this.onboarding.pendingBranches();
  }

  /** Approving is what lets a branch appear in search and take orders. */
  @Patch('branches/:branchId/review')
  @RequiredPermissions('pharmacies.approve')
  @Audit({ entityType: 'PharmacyBranch', action: 'STATUS_CHANGE', idParam: 'branchId' })
  review(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: ReviewBranchDto,
  ) {
    return this.onboarding.reviewBranch(branchId, dto);
  }

  /** Suspend or reinstate a branch that was already approved. */
  @Patch('branches/:branchId/status')
  @RequiredPermissions('pharmacies.suspend')
  @Audit({ entityType: 'PharmacyBranch', action: 'STATUS_CHANGE', idParam: 'branchId' })
  setStatus(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: SetBranchStatusDto,
  ) {
    return this.onboarding.setBranchStatus(branchId, dto.status);
  }
}
