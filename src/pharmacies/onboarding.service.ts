import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { BranchStatus, PharmacyStaffRole, UserType } from '../common/enums';
import type { RegisterPharmacyDto } from './dto/register-pharmacy.dto';
import type { CreateBranchDto } from './dto/create-branch.dto';
import type { AddStaffDto } from './dto/add-staff.dto';
import type { ReviewBranchDto } from './dto/review-branch.dto';
import { PhoneAlreadyInUseException } from '../common/exceptions/auth.exceptions';
import { NotBranchStaffException } from '../common/exceptions/commerce.exceptions';

/** Roles that may add staff or open new branches for a pharmacy. */
const ADMIN_ROLES: readonly PharmacyStaffRole[] = [
  PharmacyStaffRole.OWNER,
  PharmacyStaffRole.MANAGER,
];

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Self-service pharmacy registration.
   *
   * Creates the Pharmacy, its first branch (PENDING_APPROVAL — it cannot trade
   * until an admin approves), the owner's user account, and the OWNER staff
   * link, all in one transaction. A partial registration would strand a
   * pharmacy with no owner able to log in.
   *
   * Public: this is how a pharmacy that has no account yet gets one.
   */
  async registerPharmacy(dto: RegisterPharmacyDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.ownerPhone } });
    if (existing) throw new PhoneAlreadyInUseException();

    const licenceTaken = await this.prisma.pharmacyBranch.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (licenceTaken) {
      throw new ConflictException('A branch with this license number already exists');
    }

    const passwordHash = await bcrypt.hash(dto.ownerPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const pharmacy = await tx.pharmacy.create({
        data: { name: dto.name, nameAr: dto.nameAr, taxNumber: dto.taxNumber },
      });

      const branch = await tx.pharmacyBranch.create({
        data: {
          pharmacyId: pharmacy.id,
          name: dto.branchName,
          licenseNumber: dto.licenseNumber,
          // Always PENDING_APPROVAL regardless of what the client sends — an
          // applicant cannot approve itself.
          status: BranchStatus.PENDING_APPROVAL,
          phone: dto.branchPhone,
          whatsappNumber: dto.whatsappNumber,
          addressText: dto.addressText,
          latitude: dto.latitude,
          longitude: dto.longitude,
          ...(dto.deliveryRadiusMeters ? { deliveryRadiusMeters: dto.deliveryRadiusMeters } : {}),
        },
      });

      const owner = await tx.user.create({
        data: {
          phone: dto.ownerPhone,
          email: dto.ownerEmail,
          fullName: dto.ownerName,
          passwordHash,
          userType: UserType.PHARMACY_STAFF,
          isActive: true,
        },
      });

      await tx.pharmacyStaff.create({
        data: { userId: owner.id, branchId: branch.id, role: PharmacyStaffRole.OWNER },
      });

      return {
        pharmacyId: pharmacy.id,
        branchId: branch.id,
        ownerUserId: owner.id,
        status: branch.status,
        message:
          'Registration received. The branch is pending admin approval and cannot accept orders yet.',
      };
    });
  }

  /** An existing pharmacy opens another branch. Also starts PENDING_APPROVAL. */
  async createBranch(userId: string, pharmacyId: string, dto: CreateBranchDto) {
    await this.requirePharmacyAdmin(userId, pharmacyId);

    const licenceTaken = await this.prisma.pharmacyBranch.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (licenceTaken) {
      throw new ConflictException('A branch with this license number already exists');
    }

    return this.prisma.pharmacyBranch.create({
      data: {
        pharmacyId,
        name: dto.branchName,
        licenseNumber: dto.licenseNumber,
        status: BranchStatus.PENDING_APPROVAL,
        phone: dto.branchPhone,
        whatsappNumber: dto.whatsappNumber,
        addressText: dto.addressText,
        latitude: dto.latitude,
        longitude: dto.longitude,
        ...(dto.deliveryRadiusMeters ? { deliveryRadiusMeters: dto.deliveryRadiusMeters } : {}),
      },
    });
  }

  /**
   * Adds a staff member to a branch, creating their user account if the phone
   * is new. `PharmacyStaff.userId` is unique, so one person belongs to exactly
   * one branch.
   */
  async addStaff(actorId: string, branchId: string, dto: AddStaffDto) {
    const branch = await this.prisma.pharmacyBranch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    await this.requirePharmacyAdmin(actorId, branch.pharmacyId);

    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { pharmacyStaff: true },
    });
    if (existing?.pharmacyStaff) {
      throw new ConflictException('This person is already staff at a branch');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            phone: dto.phone,
            fullName: dto.fullName,
            passwordHash,
            userType: UserType.PHARMACY_STAFF,
            isActive: true,
          },
        }));

      const staff = await tx.pharmacyStaff.create({
        data: { userId: user.id, branchId, role: dto.role },
      });

      return { staffId: staff.id, userId: user.id, role: staff.role, branchId };
    });
  }

  /** Staff roster for one branch. */
  async listStaff(actorId: string, branchId: string) {
    const branch = await this.prisma.pharmacyBranch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    await this.requirePharmacyAdmin(actorId, branch.pharmacyId);

    return this.prisma.pharmacyStaff.findMany({
      where: { branchId },
      include: { user: { select: { id: true, fullName: true, phone: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Platform admin
  // -------------------------------------------------------------------------

  /** Branches awaiting an approval decision. */
  async pendingBranches() {
    return this.prisma.pharmacyBranch.findMany({
      where: { status: BranchStatus.PENDING_APPROVAL, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        pharmacy: { select: { id: true, name: true, taxNumber: true } },
        staff: {
          where: { role: PharmacyStaffRole.OWNER },
          include: { user: { select: { fullName: true, phone: true, email: true } } },
        },
      },
    });
  }

  /**
   * Admin decision on a branch application. Approving is what lets the branch
   * appear in customer search and accept orders — `CatalogService` and
   * `CartService` both filter on `status: APPROVED`.
   */
  async reviewBranch(branchId: string, dto: ReviewBranchDto) {
    const branch = await this.prisma.pharmacyBranch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.status !== BranchStatus.PENDING_APPROVAL) {
      throw new ConflictException(`This branch has already been reviewed (${branch.status})`);
    }

    return this.prisma.pharmacyBranch.update({
      where: { id: branchId },
      data: { status: dto.status },
    });
  }

  /** Suspend or reinstate an already-approved branch. */
  async setBranchStatus(branchId: string, status: BranchStatus) {
    const branch = await this.prisma.pharmacyBranch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    return this.prisma.pharmacyBranch.update({ where: { id: branchId }, data: { status } });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The caller must be OWNER or MANAGER at some branch of this pharmacy. */
  private async requirePharmacyAdmin(userId: string, pharmacyId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({
      where: { userId, role: { in: [...ADMIN_ROLES] }, branch: { pharmacyId } },
    });
    if (!staff) throw new NotBranchStaffException();
    return staff;
  }
}
