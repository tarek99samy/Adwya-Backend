import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PharmacyStaffRole, PrescriptionStatus, StockMovementType } from '../common/enums';
import type { PrescriptionFilterDto } from './dto/prescription-filter.dto';
import type { ReviewPrescriptionDto } from './dto/review-prescription.dto';
import {
  NotBranchStaffException,
  OrderNoLongerLiveException,
  PharmacistRoleRequiredException,
  PrescriptionAlreadyReviewedException,
  PrescriptionNotFoundException,
} from '../common/exceptions/commerce.exceptions';

/**
 * Terminal order states. A prescription attached to one of these is history -
 * the stock has already been settled and the status cannot move again.
 */
const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
];

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The pharmacist review queue for one branch. Defaults to what is actually
   * waiting rather than the whole history.
   */
  async findForBranch(userId: string, branchId: string, filter: PrescriptionFilterDto) {
    await this.requirePharmacist(userId, branchId);
    const { page = 1, limit = 20 } = filter;

    const where = {
      order: { branchId },
      status: filter.status ?? PrescriptionStatus.PENDING_REVIEW,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.prescription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' }, // oldest first: it is a queue
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              customer: { select: { id: true, fullName: true, phone: true } },
              items: true,
            },
          },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Approve or reject an uploaded prescription.
   *
   * Approving unblocks the order so staff can move it to CONFIRMED. Rejecting
   * kills the order and hands the reserved stock back (domain-notes.md
   * section 2) — all in one transaction.
   */
  async review(prescriptionId: string, userId: string, dto: ReviewPrescriptionDto) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { order: { include: { items: true } } },
    });

    if (!prescription) throw new PrescriptionNotFoundException();
    if (prescription.status !== PrescriptionStatus.PENDING_REVIEW) {
      throw new PrescriptionAlreadyReviewedException();
    }

    await this.requirePharmacist(userId, prescription.order.branchId);

    const approved = dto.status === PrescriptionStatus.APPROVED;
    const order = prescription.order;

    // Cancelling an order leaves `prescriptionStatus` at PENDING_REVIEW, so a
    // cancelled order keeps sitting in this queue. Rejecting it here would run
    // the stock restore a second time on units the cancellation already handed
    // back, and would overwrite a terminal status.
    if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
      throw new OrderNoLongerLiveException(order.status);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          status: approved ? PrescriptionStatus.APPROVED : PrescriptionStatus.REJECTED,
          reviewedById: userId,
          reviewedAt: new Date(),
          notes: dto.notes,
        },
      });

      if (approved) {
        // The order stays at PENDING_CONFIRMATION; clearing the gate simply
        // lets staff move it forward.
        return tx.order.update({
          where: { id: order.id },
          data: { prescriptionStatus: PrescriptionStatus.APPROVED },
          include: { items: true, prescriptions: true },
        });
      }

      // Rejected: give every reserved unit back before killing the order.
      for (const item of order.items) {
        await tx.branchInventory.updateMany({
          where: { branchId: order.branchId, medicineId: item.medicineId },
          data: { quantityAvailable: { increment: item.quantity } },
        });
      }

      await tx.stockMovement.createMany({
        data: order.items.map((item) => ({
          medicineId: item.medicineId,
          movementType: StockMovementType.RETURN,
          quantity: item.quantity,
          referenceType: 'ORDER',
          referenceId: order.id,
          reason: 'Prescription rejected',
          performedById: userId,
        })),
      });

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          prescriptionStatus: PrescriptionStatus.REJECTED,
          status: OrderStatus.REJECTED,
          cancelReason: dto.notes ?? 'Prescription rejected by pharmacist',
          cancelledAt: new Date(),
        },
        include: { items: true, prescriptions: true },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.REJECTED,
          changedById: userId,
          note: dto.notes ?? 'Prescription rejected',
        },
      });

      return updated;
    });
  }

  /**
   * Prescription review is restricted to PHARMACIST staff at the order's own
   * branch — OWNER and MANAGER deliberately do not qualify, because this is a
   * regulated clinical judgement, not an administrative one.
   */
  private async requirePharmacist(userId: string, branchId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({ where: { userId, branchId } });
    if (!staff) throw new NotBranchStaffException();
    if (staff.role !== PharmacyStaffRole.PHARMACIST) {
      throw new PharmacistRoleRequiredException();
    }
    return staff;
  }
}
