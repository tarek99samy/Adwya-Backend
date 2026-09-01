import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus, PrescriptionStatus, StockMovementType } from '../common/enums';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { OrderFilterDto } from './dto/order-filter.dto';
import type { TransitionOrderDto } from './dto/transition-order.dto';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import { round2 } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationTemplates } from '../notifications/notification-jobs';
import { resolveDeliveryZone } from './delivery-zone.util';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  isBlockedByPrescription,
  isCustomerCancellable,
  shouldRestoreStock,
  timestampsFor,
} from './order-status.machine';
import {
  AddressNotFoundException,
  BranchUnavailableException,
  CartEmptyException,
  ControlledMedicineException,
  IllegalOrderTransitionException,
  InsufficientStockException,
  InvalidCouponException,
  MedicineNotStockedException,
  NotBranchStaffException,
  OrderNotCancellableException,
  OrderNotFoundException,
  OutsideDeliveryAreaException,
  PaymentMethodUnavailableException,
  PrescriptionNotApprovedException,
  PrescriptionRequiredException,
} from '../common/exceptions/commerce.exceptions';

/** Payment methods settled at the door rather than through a gateway. */
const PAY_ON_DELIVERY_CODES = ['CASH', 'VISA_ON_DELIVERY'];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  /**
   * Turns the caller's cart into an order. Everything that touches stock or
   * money happens in one transaction (domain-notes.md section 1); notification
   * dispatch is deliberately left outside it.
   *
   * The client never supplies prices or totals — they are recomputed here from
   * BranchInventory at this moment and then snapshotted onto OrderItem.
   */
  async checkout(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { medicine: true } } },
    });

    if (!cart || cart.items.length === 0) {
      throw new CartEmptyException();
    }
    // The cart carries its own branch scope; the body must agree with it so a
    // stale client cannot check out against a branch the user has moved off.
    if (cart.branchId !== dto.branchId) {
      throw new BranchUnavailableException();
    }

    const [branch, address, paymentMethod] = await Promise.all([
      this.prisma.pharmacyBranch.findFirst({
        where: { id: dto.branchId, deletedAt: null, status: 'APPROVED' },
        include: { deliveryZones: true },
      }),
      this.prisma.address.findFirst({ where: { id: dto.addressId, userId } }),
      this.prisma.paymentMethod.findFirst({ where: { id: dto.paymentMethodId, isActive: true } }),
    ]);

    if (!branch) throw new BranchUnavailableException();
    if (!address) throw new AddressNotFoundException();
    if (!paymentMethod) throw new PaymentMethodUnavailableException();

    // Controlled medicines can never be ordered, even if one slipped into a
    // cart before it was flagged.
    const controlled = cart.items.find((item) => item.medicine.isControlled);
    if (controlled) {
      throw new ControlledMedicineException(controlled.medicine.name);
    }

    const deliveryLatitude = dto.deliveryLatitude ?? Number(address.latitude);
    const deliveryLongitude = dto.deliveryLongitude ?? Number(address.longitude);

    const zone = resolveDeliveryZone(branch.deliveryZones, deliveryLatitude, deliveryLongitude);
    if (!zone) {
      throw new OutsideDeliveryAreaException();
    }

    // Price every line off live inventory. One query, not one per item.
    const inventories = await this.prisma.branchInventory.findMany({
      where: {
        branchId: branch.id,
        medicineId: { in: cart.items.map((item) => item.medicineId) },
      },
    });
    const byMedicine = new Map(inventories.map((row) => [row.medicineId, row]));

    const lines = cart.items.map((item) => {
      const inventory = byMedicine.get(item.medicineId);
      if (!inventory) {
        throw new MedicineNotStockedException(item.medicineId);
      }
      if (!inventory.isAvailable || inventory.quantityAvailable < item.quantity) {
        throw new InsufficientStockException(
          item.medicine.name,
          item.quantity,
          inventory.isAvailable ? inventory.quantityAvailable : 0,
        );
      }

      const unitPrice = Number(inventory.price);
      return {
        medicineId: item.medicineId,
        medicineNameSnapshot: item.medicine.name,
        unitPriceSnapshot: unitPrice,
        quantity: item.quantity,
        subtotal: round2(unitPrice * item.quantity),
        requiresPrescription: item.medicine.requiresPrescription,
        name: item.medicine.name,
      };
    });

    // Prescription gating: an Rx cart needs images up front, and the order
    // enters PENDING_REVIEW so it cannot progress until a pharmacist signs off.
    const rxLines = lines.filter((line) => line.requiresPrescription);
    const needsPrescription = rxLines.length > 0;
    if (needsPrescription && !dto.prescriptionImageUrls?.length) {
      throw new PrescriptionRequiredException(rxLines.map((line) => line.name));
    }

    const subtotal = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
    const coupon = dto.couponCode
      ? await this.validateCoupon(dto.couponCode, userId, subtotal)
      : null;

    const discountTotal = coupon ? computeDiscount(coupon, subtotal) : 0;
    const deliveryFee = zone.deliveryFee;
    const total = round2(Math.max(0, subtotal - discountTotal) + deliveryFee);

    const orderNumber = generateOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      // Conditional decrement per line. `updateMany` with the quantity guard in
      // the WHERE clause makes this atomic: two concurrent checkouts for the
      // last unit cannot both match, so the loser sees count === 0 and the
      // whole transaction aborts. This is the oversell guard.
      for (const line of lines) {
        const { count } = await tx.branchInventory.updateMany({
          where: {
            branchId: branch.id,
            medicineId: line.medicineId,
            isAvailable: true,
            quantityAvailable: { gte: line.quantity },
          },
          data: { quantityAvailable: { decrement: line.quantity } },
        });

        if (count === 0) {
          const current = await tx.branchInventory.findUnique({
            where: {
              branchId_medicineId: { branchId: branch.id, medicineId: line.medicineId },
            },
          });
          throw new InsufficientStockException(
            line.medicineNameSnapshot,
            line.quantity,
            current?.isAvailable ? current.quantityAvailable : 0,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: userId,
          branchId: branch.id,
          addressId: address.id,
          paymentMethodId: paymentMethod.id,
          status: OrderStatus.PENDING_CONFIRMATION,
          paymentStatus: PaymentStatus.PENDING,
          prescriptionStatus: needsPrescription
            ? PrescriptionStatus.PENDING_REVIEW
            : PrescriptionStatus.NOT_REQUIRED,
          subtotal,
          deliveryFee,
          discountTotal,
          total,
          deliveryAddressText: formatAddress(address, dto.deliveryNote),
          deliveryLatitude,
          deliveryLongitude,
          items: {
            create: lines.map((line) => ({
              medicineId: line.medicineId,
              medicineNameSnapshot: line.medicineNameSnapshot,
              unitPriceSnapshot: line.unitPriceSnapshot,
              quantity: line.quantity,
              subtotal: line.subtotal,
            })),
          },
          statusHistory: {
            create: {
              status: OrderStatus.PENDING_CONFIRMATION,
              changedById: userId,
              note: 'Order placed',
            },
          },
          payment: {
            create: {
              paymentMethodId: paymentMethod.id,
              amount: total,
              status: PaymentStatus.PENDING,
            },
          },
        },
        include: { items: true },
      });

      // One SALE movement per line, pointing back at the order.
      await tx.stockMovement.createMany({
        data: lines.map((line) => ({
          medicineId: line.medicineId,
          movementType: StockMovementType.SALE,
          quantity: -line.quantity,
          referenceType: 'ORDER',
          referenceId: created.id,
          performedById: userId,
        })),
      });

      if (needsPrescription) {
        await tx.prescription.create({
          data: {
            orderId: created.id,
            imageUrls: dto.prescriptionImageUrls ?? [],
            status: PrescriptionStatus.PENDING_REVIEW,
          },
        });
      }

      // Coupon bookkeeping lives inside the transaction so two simultaneous
      // checkouts cannot both consume the last use of a limited coupon.
      if (coupon) {
        await tx.couponUsage.create({
          data: { couponId: coupon.id, userId, orderId: created.id },
        });

        if (coupon.maxUses !== null) {
          const used = await tx.couponUsage.count({ where: { couponId: coupon.id } });
          if (used > coupon.maxUses) {
            throw new InvalidCouponException('it has reached its usage limit');
          }
        }
      }

      // The cart is consumed by a successful checkout.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { branchId: null } });

      return created;
    });

    // Outside the transaction on purpose: a queue failure must never roll back
    // a placed order. `enqueue` swallows its own errors for the same reason.
    this.logger.log(`Order ${order.orderNumber} placed by ${userId} at branch ${branch.id}`);
    await this.safeNotify({
      userId,
      templateCode: NotificationTemplates.ORDER_PLACED,
      type: 'ORDER_UPDATE',
      variables: { orderNumber: order.orderNumber, branchName: branch.name },
    });

    return this.findOne(order.id, userId);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** Customer-facing list — always scoped to the caller's own orders. */
  async findMine(userId: string, filter: OrderFilterDto) {
    const { page = 1, limit = 20 } = filter;

    const where: Prisma.OrderWhereInput = {
      customerId: userId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.paymentStatus ? { paymentStatus: filter.paymentStatus } : {}),
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...dateWindow(filter.createdFrom, filter.createdTo),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true, branch: { select: { id: true, name: true, phone: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Branch-side queue. The caller must be staff at the branch they ask about,
   * which is what stops one pharmacy reading another's orders.
   */
  async findForBranch(userId: string, branchId: string, filter: OrderFilterDto) {
    await this.requireBranchStaff(userId, branchId);
    const { page = 1, limit = 20 } = filter;

    const where: Prisma.OrderWhereInput = {
      branchId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.paymentStatus ? { paymentStatus: filter.paymentStatus } : {}),
      ...(filter.prescriptionStatus ? { prescriptionStatus: filter.prescriptionStatus } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...dateWindow(filter.createdFrom, filter.createdTo),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          customer: { select: { id: true, fullName: true, phone: true } },
          prescriptions: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * A single order, visible to its customer and to staff at its branch.
   * `userId` is always the caller — never a path parameter.
   */
  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payment: true,
        prescriptions: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        deliveryRun: true,
        branch: { select: { id: true, name: true, phone: true, addressText: true } },
      },
    });

    if (!order) throw new OrderNotFoundException();

    if (order.customerId !== userId) {
      await this.requireBranchStaff(userId, order.branchId);
    }

    return order;
  }

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  /**
   * Staff-driven status change. Validates against the allowed-transitions map,
   * honours the prescription gate, writes history, and reverses stock when the
   * order dies before delivery.
   */
  async transition(orderId: string, userId: string, dto: TransitionOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();

    await this.requireBranchStaff(userId, order.branchId);

    if (!canTransition(order.status, dto.status)) {
      throw new IllegalOrderTransitionException(order.status, dto.status);
    }
    if (isBlockedByPrescription(dto.status, order.prescriptionStatus)) {
      throw new PrescriptionNotApprovedException();
    }

    const updated = await this.applyTransition(order, dto.status, userId, dto.note);
    await this.notifyStatusChange(
      order.customerId,
      updated.orderNumber,
      dto.status,
      dto.note,
    );
    return updated;
  }

  /**
   * Customer withdrawing their own order. Allowed only while the pharmacy has
   * not confirmed it yet; after that they have to call the pharmacy.
   */
  async cancelAsCustomer(orderId: string, userId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new OrderNotFoundException();
    if (order.customerId !== userId) throw new OrderNotFoundException();

    if (!isCustomerCancellable(order.status)) {
      throw new OrderNotCancellableException(order.status);
    }

    const reason = dto.cancelReason ?? 'Cancelled by customer';
    const updated = await this.applyTransition(order, OrderStatus.CANCELLED, userId, reason);
    await this.notifyStatusChange(userId, updated.orderNumber, OrderStatus.CANCELLED, reason);
    return updated;
  }

  /**
   * Shared tail of every status change: history row, timestamps, stock
   * reversal, and the cash-on-delivery payment settlement.
   */
  private async applyTransition(
    order: {
      id: string;
      status: OrderStatus;
      branchId: string;
      customerId: string;
      items: { medicineId: string; quantity: number }[];
    },
    to: OrderStatus,
    actorId: string,
    note?: string,
  ) {
    const restoreStock = shouldRestoreStock(order.status, to);

    return this.prisma.$transaction(async (tx) => {
      if (restoreStock) {
        // Put every reserved unit back and record why.
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
            reason: `Order ${to.toLowerCase()}`,
            performedById: actorId,
          })),
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: to,
          ...timestampsFor(to),
          ...(to === OrderStatus.CANCELLED || to === OrderStatus.REJECTED
            ? { cancelReason: note ?? null }
            : {}),
        },
        include: { payment: true },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: to, changedById: actorId, note },
      });

      // Cash and visa-on-delivery settle when the courier hands the order over.
      if (to === OrderStatus.DELIVERED) {
        const method = await tx.paymentMethod.findUnique({
          where: { id: updated.paymentMethodId },
        });
        if (method && PAY_ON_DELIVERY_CODES.includes(method.code)) {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentStatus: PaymentStatus.PAID },
          });
          await tx.payment.updateMany({
            where: { orderId: order.id },
            data: { status: PaymentStatus.PAID },
          });
        }
      }

      return updated;
    });
  }

  /** Maps a destination status to the template announcing it, if any. */
  private async notifyStatusChange(
    customerId: string,
    orderNumber: string,
    to: OrderStatus,
    note?: string,
  ) {
    const template = {
      [OrderStatus.CONFIRMED]: NotificationTemplates.ORDER_CONFIRMED,
      [OrderStatus.OUT_FOR_DELIVERY]: NotificationTemplates.ORDER_OUT_FOR_DELIVERY,
      [OrderStatus.DELIVERED]: NotificationTemplates.ORDER_DELIVERED,
      [OrderStatus.CANCELLED]: NotificationTemplates.ORDER_CANCELLED,
      [OrderStatus.REJECTED]: NotificationTemplates.ORDER_CANCELLED,
    }[to as string];

    // PREPARING has no customer-facing message — the pharmacy assembling an
    // order is not news worth a push.
    if (!template) return;

    await this.safeNotify({
      userId: customerId,
      templateCode: template,
      type: 'ORDER_UPDATE',
      variables: { orderNumber, reason: note ?? '' },
    });
  }

  /**
   * Notification dispatch must never surface as a failed order.
   *
   * `NotificationsService.enqueue` already swallows its own errors, but the
   * order has been committed by the time we get here — so the call site guards
   * too rather than trusting a collaborator not to throw. A customer seeing a
   * 500 after a successful checkout would reasonably retry and double-order.
   */
  private async safeNotify(job: Parameters<NotificationsService['enqueue']>[0]) {
    try {
      await this.notifications.enqueue(job);
    } catch (err) {
      this.logger.warn(`Notification dispatch failed: ${(err as Error).message}`);
    }
  }

  /** Which statuses the caller could move this order to right now. */
  nextStatuses(status: OrderStatus): readonly OrderStatus[] {
    return ALLOWED_TRANSITIONS[status];
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Throws unless the user is on staff at the given branch. */
  private async requireBranchStaff(userId: string, branchId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({
      where: { userId, branchId },
    });
    if (!staff) throw new NotBranchStaffException();
    return staff;
  }

  /**
   * Coupon validity: active, inside its window, order big enough, and within
   * both the global and per-user use limits. The limited-use race is closed by
   * re-counting inside the checkout transaction.
   */
  private async validateCoupon(code: string, userId: string, subtotal: number) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    const now = new Date();

    if (!coupon || !coupon.isActive) {
      throw new InvalidCouponException('it is not a valid code');
    }
    if (now < coupon.validFrom || now > coupon.validTo) {
      throw new InvalidCouponException('it is outside its validity window');
    }
    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
      throw new InvalidCouponException(
        `the order must be at least ${Number(coupon.minOrderAmount)} EGP`,
      );
    }

    if (coupon.maxUses !== null) {
      const used = await this.prisma.couponUsage.count({ where: { couponId: coupon.id } });
      if (used >= coupon.maxUses) {
        throw new InvalidCouponException('it has reached its usage limit');
      }
    }
    if (coupon.maxUsesPerUser !== null) {
      const usedByUser = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, userId },
      });
      if (usedByUser >= coupon.maxUsesPerUser) {
        throw new InvalidCouponException('you have already used this coupon');
      }
    }

    return coupon;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDiscount(
  coupon: { discountType: string; discountValue: unknown },
  subtotal: number,
): number {
  const value = Number(coupon.discountValue);
  const raw = coupon.discountType === 'PERCENTAGE' ? (subtotal * value) / 100 : value;
  // A coupon can zero an order out but never make it negative.
  return round2(Math.min(raw, subtotal));
}

function formatAddress(
  address: { building: string | null; street: string; area: string; city: string; governorate: string },
  note?: string,
): string {
  const parts = [address.building, address.street, address.area, address.city, address.governorate]
    .filter(Boolean)
    .join(', ');
  return note ? `${parts} (${note})` : parts;
}

/**
 * Human-quotable order number: ADW-<base36 time><random>. Unique in practice
 * and, unlike a raw uuid, something a customer can read over the phone. The DB
 * still enforces uniqueness on the column.
 */
function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .toUpperCase()
    .padStart(3, '0');
  return `ADW-${stamp}${salt}`;
}

function dateWindow(from?: string, to?: string): Prisma.OrderWhereInput {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    },
  };
}
