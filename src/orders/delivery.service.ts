import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrderStatus, PharmacyStaffRole } from '../common/enums';
import type { AssignCourierDto } from './dto/assign-courier.dto';
import type { CourierLocationDto } from './dto/courier-location.dto';
import { NotBranchStaffException, OrderNotFoundException } from '../common/exceptions/commerce.exceptions';

/**
 * How often a courier's position is written through to Postgres. Ticks arrive
 * far more often than this; the ones in between live only in Redis.
 */
const GPS_WRITE_THROUGH_SECONDS = 30;

/** How long a buffered position stays readable for live tracking. */
const GPS_CACHE_TTL_SECONDS = 300;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Branch staff hands an order to a courier. Allowed from CONFIRMED onward —
   * assigning before the pharmacy has confirmed would reserve a courier for an
   * order that might still be rejected.
   */
  async assignCourier(orderId: string, actorId: string, dto: AssignCourierDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundException();

    await this.requireBranchStaff(actorId, order.branchId);

    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.PREPARING
    ) {
      throw new ConflictException(
        `A courier can only be assigned to a CONFIRMED or PREPARING order (this one is ${order.status}).`,
      );
    }

    // The courier must be a COURIER-role staff member at this same branch.
    const courier = await this.prisma.pharmacyStaff.findFirst({
      where: { id: dto.courierStaffId, branchId: order.branchId },
    });
    if (!courier) {
      throw new NotFoundException('Courier not found at this branch');
    }
    if (courier.role !== PharmacyStaffRole.COURIER) {
      throw new BadRequestException('The assigned staff member is not a courier');
    }

    // One run per order; re-assigning replaces the courier on the existing row.
    return this.prisma.deliveryRun.upsert({
      where: { orderId },
      create: { orderId, courierStaffId: dto.courierStaffId },
      update: { courierStaffId: dto.courierStaffId, assignedAt: new Date() },
    });
  }

  /**
   * Courier marks the order collected. Moves the order to OUT_FOR_DELIVERY in
   * the same transaction so the run and the order never disagree.
   */
  async markPickedUp(orderId: string, actorId: string) {
    const { run, order } = await this.requireOwnRun(orderId, actorId);

    if (run.pickedUpAt) {
      throw new ConflictException('This order has already been picked up');
    }
    if (order.status !== OrderStatus.PREPARING) {
      throw new ConflictException(
        `Only a PREPARING order can be picked up (this one is ${order.status}).`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryRun.update({
        where: { orderId },
        data: { pickedUpAt: new Date() },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.OUT_FOR_DELIVERY },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: OrderStatus.OUT_FOR_DELIVERY,
          changedById: actorId,
          note: 'Picked up by courier',
        },
      });

      return updated;
    });
  }

  /**
   * Courier GPS tick.
   *
   * Every tick lands in Redis, which is what live tracking reads. Postgres is
   * only written once per GPS_WRITE_THROUGH_SECONDS window, claimed with a
   * SET NX — so a courier app pinging every two seconds produces two database
   * writes a minute instead of thirty (domain-notes.md section 4).
   *
   * When Redis is down `acquireWindow` fails open, so every tick writes
   * through: slower, but positions are never silently lost.
   */
  async updateLocation(orderId: string, actorId: string, dto: CourierLocationDto) {
    await this.requireOwnRun(orderId, actorId);

    const position = {
      latitude: dto.latitude,
      longitude: dto.longitude,
      at: new Date().toISOString(),
    };

    await this.redis.set(
      gpsKey(orderId),
      JSON.stringify(position),
      GPS_CACHE_TTL_SECONDS,
    );

    const shouldPersist = await this.redis.acquireWindow(
      gpsWindowKey(orderId),
      GPS_WRITE_THROUGH_SECONDS,
    );

    if (shouldPersist) {
      await this.prisma.deliveryRun.update({
        where: { orderId },
        data: { currentLatitude: dto.latitude, currentLongitude: dto.longitude },
      });
    }

    return { orderId, ...position, persisted: shouldPersist };
  }

  /** Live tracking for the order's own customer. */
  async trackForCustomer(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, status: true },
    });
    if (!order || order.customerId !== userId) throw new OrderNotFoundException();

    const run = await this.prisma.deliveryRun.findUnique({
      where: { orderId },
      include: {
        courier: { include: { user: { select: { fullName: true, phone: true } } } },
      },
    });
    if (!run) throw new NotFoundException('No courier has been assigned yet');

    // Prefer the buffered position: Postgres only holds the last write-through,
    // so it can be up to GPS_WRITE_THROUGH_SECONDS stale.
    const buffered = await this.readBufferedPosition(orderId);

    return {
      orderId,
      orderStatus: order.status,
      assignedAt: run.assignedAt,
      pickedUpAt: run.pickedUpAt,
      deliveredAt: run.deliveredAt,
      courierName: run.courier.user.fullName,
      courierPhone: run.courier.user.phone,
      currentLatitude: buffered?.latitude ?? run.currentLatitude,
      currentLongitude: buffered?.longitude ?? run.currentLongitude,
      positionAt: buffered?.at ?? null,
      live: Boolean(buffered),
    };
  }

  /** Last position from Redis, or null when nothing is buffered. */
  private async readBufferedPosition(
    orderId: string,
  ): Promise<{ latitude: number; longitude: number; at: string } | null> {
    const raw = await this.redis.get(gpsKey(orderId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { latitude: number; longitude: number; at: string };
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The acting user must be the courier actually assigned to this run. */
  private async requireOwnRun(orderId: string, actorId: string) {
    const run = await this.prisma.deliveryRun.findUnique({
      where: { orderId },
      include: { courier: true, order: true },
    });
    if (!run) throw new NotFoundException('No delivery run for this order');
    if (run.courier.userId !== actorId) {
      throw new NotBranchStaffException();
    }
    return { run, order: run.order };
  }

  private async requireBranchStaff(userId: string, branchId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({ where: { userId, branchId } });
    if (!staff) throw new NotBranchStaffException();
    return staff;
  }
}

const gpsKey = (orderId: string) => `delivery:gps:${orderId}`;
const gpsWindowKey = (orderId: string) => `delivery:gps:window:${orderId}`;
