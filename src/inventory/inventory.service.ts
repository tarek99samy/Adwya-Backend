import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BatchLocationType, PharmacyStaffRole, StockMovementType } from '../common/enums';
import type { SetInventoryDto } from './dto/set-inventory.dto';
import type { ReceiveBatchDto } from './dto/receive-batch.dto';
import type { TransferBatchDto } from './dto/transfer-batch.dto';
import type { InventoryFilterDto } from './dto/inventory-filter.dto';
import { NotBranchStaffException } from '../common/exceptions/commerce.exceptions';

/**
 * How many recent orders at a branch are scanned when reconstructing which
 * stock movements belong to it. Bounded so the id list handed to Postgres
 * cannot grow with a busy branch's whole order history.
 */
const MOVEMENT_ORDER_SCAN = 500;

/** Roles allowed to change stock or pricing at a branch. */
const STOCK_MANAGER_ROLES: readonly PharmacyStaffRole[] = [
  PharmacyStaffRole.OWNER,
  PharmacyStaffRole.MANAGER,
  PharmacyStaffRole.PHARMACIST,
];

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Branch inventory (price + availability)
  // -------------------------------------------------------------------------

  /** The branch's own stock list, including rows the customer never sees. */
  async listForBranch(userId: string, branchId: string, filter: InventoryFilterDto) {
    await this.requireStockManager(userId, branchId);
    const { page = 1, limit = 50 } = filter;

    const where = {
      branchId,
      ...(filter.medicineId ? { medicineId: filter.medicineId } : {}),
      ...(filter.isAvailable !== undefined ? { isAvailable: filter.isAvailable } : {}),
      ...(filter.lowStock ? { quantityAvailable: { lte: filter.lowStockThreshold ?? 10 } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.branchInventory.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { medicine: { name: 'asc' } },
        include: { medicine: { select: { id: true, name: true, requiresPrescription: true } } },
      }),
      this.prisma.branchInventory.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  /**
   * Sets price and availability for one medicine at one branch.
   *
   * `quantityAvailable` is deliberately NOT settable here — stock only moves
   * through batch receipts, transfers, sales and returns, so that
   * `StockMovement` stays a complete audit trail. Use `adjustStock` for a
   * counted correction, which writes an ADJUSTMENT movement.
   */
  async setInventory(userId: string, branchId: string, dto: SetInventoryDto) {
    await this.requireStockManager(userId, branchId);

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: dto.medicineId, deletedAt: null },
    });
    if (!medicine) throw new NotFoundException('Medicine not found');

    const existing = await this.prisma.branchInventory.findUnique({
      where: { branchId_medicineId: { branchId, medicineId: dto.medicineId } },
    });

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.branchInventory.upsert({
        where: { branchId_medicineId: { branchId, medicineId: dto.medicineId } },
        create: {
          branchId,
          medicineId: dto.medicineId,
          price: dto.price,
          isAvailable: dto.isAvailable ?? true,
          quantityAvailable: 0,
        },
        update: {
          price: dto.price,
          ...(dto.isAvailable === undefined ? {} : { isAvailable: dto.isAvailable }),
        },
      });

      // Price history is append-only; only write when the price actually moved.
      if (!existing || Number(existing.price) !== dto.price) {
        await tx.priceHistory.create({
          data: { branchId, medicineId: dto.medicineId, price: dto.price },
        });
      }

      return row;
    });
  }

  /**
   * Counted correction after a physical stock-take. Writes an ADJUSTMENT
   * movement carrying the delta so the ledger still reconciles.
   */
  async adjustStock(
    userId: string,
    branchId: string,
    medicineId: string,
    countedQuantity: number,
    reason: string,
  ) {
    await this.requireStockManager(userId, branchId);

    const row = await this.prisma.branchInventory.findUnique({
      where: { branchId_medicineId: { branchId, medicineId } },
    });
    if (!row) throw new NotFoundException('This medicine is not stocked at this branch');

    const delta = countedQuantity - row.quantityAvailable;
    if (delta === 0) return row;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchInventory.update({
        where: { id: row.id },
        data: { quantityAvailable: countedQuantity },
      });
      await tx.stockMovement.create({
        data: {
          medicineId,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: delta,
          referenceType: 'STOCK_TAKE',
          referenceId: row.id,
          reason,
          performedById: userId,
        },
      });
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Batches
  // -------------------------------------------------------------------------

  /**
   * Goods-in. A batch lands either at a warehouse (WAREHOUSE_RECEIPT) or
   * straight at a branch (WAREHOUSE_RECEIPT then immediately available).
   * Receiving at a branch also raises `BranchInventory.quantityAvailable`, in
   * the same transaction, so stock and ledger cannot drift.
   */
  async receiveBatch(userId: string, dto: ReceiveBatchDto) {
    if (dto.locationType === BatchLocationType.BRANCH) {
      if (!dto.branchId) throw new BadRequestException('branchId is required for a branch receipt');
      await this.requireStockManager(userId, dto.branchId);
    } else {
      if (!dto.warehouseId) {
        throw new BadRequestException('warehouseId is required for a warehouse receipt');
      }
      await this.requireWarehouseStaff(userId, dto.warehouseId);
    }

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: dto.medicineId, deletedAt: null },
    });
    if (!medicine) throw new NotFoundException('Medicine not found');

    if (new Date(dto.expiryDate) <= new Date()) {
      throw new BadRequestException('Cannot receive a batch that is already expired');
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: {
          medicineId: dto.medicineId,
          locationType: dto.locationType,
          warehouseId: dto.locationType === BatchLocationType.WAREHOUSE ? dto.warehouseId : null,
          branchId: dto.locationType === BatchLocationType.BRANCH ? dto.branchId : null,
          batchNumber: dto.batchNumber,
          expiryDate: new Date(dto.expiryDate),
          quantity: dto.quantity,
          costPrice: dto.costPrice,
        },
      });

      await tx.stockMovement.create({
        data: {
          medicineId: dto.medicineId,
          batchId: batch.id,
          movementType: StockMovementType.WAREHOUSE_RECEIPT,
          quantity: dto.quantity,
          referenceType: 'BATCH',
          referenceId: batch.id,
          reason: `Received batch ${dto.batchNumber}`,
          performedById: userId,
        },
      });

      // A branch receipt is immediately sellable; a warehouse receipt is not
      // until it is transferred.
      if (dto.locationType === BatchLocationType.BRANCH && dto.branchId) {
        await tx.branchInventory.upsert({
          where: { branchId_medicineId: { branchId: dto.branchId, medicineId: dto.medicineId } },
          create: {
            branchId: dto.branchId,
            medicineId: dto.medicineId,
            price: dto.sellingPrice ?? dto.costPrice,
            quantityAvailable: dto.quantity,
            isAvailable: true,
          },
          update: { quantityAvailable: { increment: dto.quantity } },
        });
      }

      return batch;
    });
  }

  /**
   * Moves units from a warehouse batch to a branch: decrements the warehouse
   * batch, creates (or tops up) the mirror branch batch, raises the branch's
   * sellable stock, and writes a TRANSFER_TO_BRANCH movement — all atomically.
   */
  async transferToBranch(userId: string, dto: TransferBatchDto) {
    await this.requireStockManager(userId, dto.branchId);

    const source = await this.prisma.batch.findUnique({ where: { id: dto.batchId } });
    if (!source) throw new NotFoundException('Batch not found');
    if (source.locationType !== BatchLocationType.WAREHOUSE || !source.warehouseId) {
      throw new BadRequestException('Only a warehouse batch can be transferred to a branch');
    }
    if (source.quantity < dto.quantity) {
      throw new BadRequestException(
        `Batch holds ${source.quantity} unit(s); cannot transfer ${dto.quantity}`,
      );
    }

    // The warehouse and the destination branch must belong to the same pharmacy.
    const [warehouse, branch] = await Promise.all([
      this.prisma.pharmacyWarehouse.findUnique({ where: { id: source.warehouseId } }),
      this.prisma.pharmacyBranch.findFirst({ where: { id: dto.branchId, deletedAt: null } }),
    ]);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!warehouse || warehouse.pharmacyId !== branch.pharmacyId) {
      throw new BadRequestException('Warehouse and branch belong to different pharmacies');
    }

    return this.prisma.$transaction(async (tx) => {
      // Guarded decrement, same pattern as checkout: two concurrent transfers
      // of the last units cannot both succeed.
      const { count } = await tx.batch.updateMany({
        where: { id: source.id, quantity: { gte: dto.quantity } },
        data: { quantity: { decrement: dto.quantity } },
      });
      if (count === 0) {
        throw new BadRequestException('Batch stock changed; please retry');
      }

      const branchBatch = await tx.batch.create({
        data: {
          medicineId: source.medicineId,
          locationType: BatchLocationType.BRANCH,
          branchId: dto.branchId,
          batchNumber: source.batchNumber,
          expiryDate: source.expiryDate,
          quantity: dto.quantity,
          costPrice: source.costPrice,
        },
      });

      await tx.stockMovement.create({
        data: {
          medicineId: source.medicineId,
          batchId: branchBatch.id,
          movementType: StockMovementType.TRANSFER_TO_BRANCH,
          quantity: dto.quantity,
          referenceType: 'BATCH',
          referenceId: source.id,
          reason: `Transferred from warehouse ${warehouse.name}`,
          performedById: userId,
        },
      });

      await tx.branchInventory.upsert({
        where: {
          branchId_medicineId: { branchId: dto.branchId, medicineId: source.medicineId },
        },
        create: {
          branchId: dto.branchId,
          medicineId: source.medicineId,
          price: dto.sellingPrice ?? Number(source.costPrice),
          quantityAvailable: dto.quantity,
          isAvailable: true,
        },
        update: { quantityAvailable: { increment: dto.quantity } },
      });

      return branchBatch;
    });
  }

  /** Batches nearest expiry first — the FEFO working list. */
  async expiringBatches(userId: string, branchId: string, withinDays = 90) {
    await this.requireStockManager(userId, branchId);

    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.batch.findMany({
      where: { branchId, quantity: { gt: 0 }, expiryDate: { lte: cutoff } },
      orderBy: { expiryDate: 'asc' },
      include: { medicine: { select: { id: true, name: true } } },
    });
  }

  /**
   * Movement ledger for one medicine at one branch.
   *
   * `StockMovement` carries no branchId column, so the branch has to be derived
   * from the references each movement does carry:
   *
   *   - receipts and transfers link to the `Batch` that landed at the branch
   *   - sales and returns reference the ORDER they belong to
   *   - stock-take corrections reference the branch's own BranchInventory row
   *   - refund returns reference the REFUND, which hangs off one of those orders
   *
   * Filtering on `medicineId` alone - as this did - hands a manager at one
   * pharmacy the movement history of every other pharmacy stocking the same
   * medicine, which is competitor sales data.
   *
   * The order scan is bounded: movements belonging to an order older than the
   * most recent MOVEMENT_ORDER_SCAN for this branch and medicine are not
   * listed. That is well beyond the 100 rows this returns.
   */
  async movements(userId: string, branchId: string, medicineId: string) {
    await this.requireStockManager(userId, branchId);

    const [orders, inventory] = await Promise.all([
      this.prisma.order.findMany({
        where: { branchId, items: { some: { medicineId } } },
        select: { id: true, refunds: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        take: MOVEMENT_ORDER_SCAN,
      }),
      this.prisma.branchInventory.findUnique({
        where: { branchId_medicineId: { branchId, medicineId } },
        select: { id: true },
      }),
    ]);

    const orderIds = orders.map((order) => order.id);
    const refundIds = orders.flatMap((order) => order.refunds.map((refund) => refund.id));

    const scopes: Prisma.StockMovementWhereInput[] = [
      { batch: { branchId } },
      { referenceType: 'ORDER', referenceId: { in: orderIds } },
      { referenceType: 'REFUND', referenceId: { in: refundIds } },
    ];
    if (inventory) {
      scopes.push({ referenceType: 'STOCK_TAKE', referenceId: inventory.id });
    }

    return this.prisma.stockMovement.findMany({
      where: { medicineId, OR: scopes },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireStockManager(userId: string, branchId: string) {
    const staff = await this.prisma.pharmacyStaff.findFirst({ where: { userId, branchId } });
    if (!staff) throw new NotBranchStaffException();
    if (!STOCK_MANAGER_ROLES.includes(staff.role)) {
      throw new NotBranchStaffException();
    }
    return staff;
  }

  /** Warehouse receipts are authorised via any managing role in the pharmacy. */
  private async requireWarehouseStaff(userId: string, warehouseId: string) {
    const warehouse = await this.prisma.pharmacyWarehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const staff = await this.prisma.pharmacyStaff.findFirst({
      where: {
        userId,
        role: { in: [PharmacyStaffRole.OWNER, PharmacyStaffRole.MANAGER] },
        branch: { pharmacyId: warehouse.pharmacyId },
      },
    });
    if (!staff) throw new NotBranchStaffException();
    return staff;
  }
}
