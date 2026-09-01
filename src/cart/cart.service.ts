import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddCartItemDto } from './dto/add-cart-item.dto';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto';
import {
  CartBranchMismatchException,
  CartItemNotFoundException,
  ControlledMedicineException,
  InsufficientStockException,
  MedicineNotStockedException,
} from '../common/exceptions/commerce.exceptions';

/** A cart line joined with the branch price/stock it resolves to. */
export interface PricedCartItem {
  id: string;
  medicineId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  requiresPrescription: boolean;
  quantityAvailable: number;
  inStock: boolean;
}

export interface PricedCart {
  id: string;
  userId: string;
  branchId: string | null;
  updatedAt: Date;
  items: PricedCartItem[];
  subtotal: number;
  /** True when every line is still purchasable at its current quantity. */
  isCheckoutable: boolean;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the caller's cart, creating an empty one on first access so the
   * client never has to special-case "no cart yet".
   */
  async getCart(userId: string): Promise<PricedCart> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: { include: { medicine: true } } },
    });

    return this.priceCart(cart);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<PricedCart> {
    const cart = await this.requireCart(userId);

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: dto.medicineId, deletedAt: null },
    });
    if (!medicine) {
      throw new MedicineNotStockedException(dto.medicineId);
    }
    // Controlled medicines are never orderable in-app (domain-notes.md section 1).
    if (medicine.isControlled) {
      throw new ControlledMedicineException(medicine.name);
    }

    // Which branch stocks this medicine? If the cart is already scoped the item
    // must come from that same branch; otherwise this first add sets the scope.
    const inventory = await this.resolveInventory(dto.medicineId, cart.branchId);

    if (cart.branchId && inventory.branchId !== cart.branchId) {
      throw new CartBranchMismatchException(cart.branchId, inventory.branchId);
    }

    // Adding an existing line accumulates; the combined quantity must still fit
    // in stock.
    const existing = cart.items.find((item) => item.medicineId === dto.medicineId);
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (!inventory.isAvailable || inventory.quantityAvailable < nextQuantity) {
      throw new InsufficientStockException(
        medicine.name,
        nextQuantity,
        inventory.isAvailable ? inventory.quantityAvailable : 0,
      );
    }

    await this.prisma.$transaction([
      this.prisma.cart.update({
        where: { id: cart.id },
        data: { branchId: inventory.branchId },
      }),
      this.prisma.cartItem.upsert({
        where: { cartId_medicineId: { cartId: cart.id, medicineId: dto.medicineId } },
        create: { cartId: cart.id, medicineId: dto.medicineId, quantity: dto.quantity },
        update: { quantity: nextQuantity },
      }),
    ]);

    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<PricedCart> {
    const cart = await this.requireCart(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new CartItemNotFoundException();
    }

    const medicine = await this.prisma.medicine.findFirst({
      where: { id: item.medicineId, deletedAt: null },
    });
    if (!medicine) {
      throw new MedicineNotStockedException(item.medicineId);
    }

    const inventory = await this.resolveInventory(item.medicineId, cart.branchId);
    if (!inventory.isAvailable || inventory.quantityAvailable < dto.quantity) {
      throw new InsufficientStockException(
        medicine.name,
        dto.quantity,
        inventory.isAvailable ? inventory.quantityAvailable : 0,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<PricedCart> {
    const cart = await this.requireCart(userId);
    const item = cart.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new CartItemNotFoundException();
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });

    // Dropping the last line releases the branch scope, so the next add is free
    // to pick any branch without an explicit switch.
    if (cart.items.length === 1) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { branchId: null } });
    }

    return this.getCart(userId);
  }

  /** Empties the cart and releases its branch scope. */
  async clear(userId: string): Promise<PricedCart> {
    const cart = await this.requireCart(userId);

    await this.prisma.$transaction([
      this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
      this.prisma.cart.update({ where: { id: cart.id }, data: { branchId: null } }),
    ]);

    return this.getCart(userId);
  }

  /**
   * Explicit "discard my cart and start again at this branch" — the client calls
   * this after the user confirms a CART_BRANCH_MISMATCH prompt.
   */
  async switchBranch(userId: string, dto: AddCartItemDto): Promise<PricedCart> {
    await this.clear(userId);
    return this.addItem(userId, dto);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: true },
    });
  }

  /**
   * Finds the BranchInventory row backing a medicine. When the cart is already
   * branch-scoped we look only at that branch; otherwise we pick the cheapest
   * in-stock branch, which is what the customer sees on the product page.
   */
  private async resolveInventory(medicineId: string, branchId: string | null) {
    const inventory = await this.prisma.branchInventory.findFirst({
      where: {
        medicineId,
        ...(branchId ? { branchId } : { isAvailable: true, quantityAvailable: { gt: 0 } }),
        branch: { deletedAt: null, status: 'APPROVED' },
      },
      orderBy: branchId ? undefined : { price: 'asc' },
    });

    if (!inventory) {
      throw new MedicineNotStockedException(medicineId);
    }
    return inventory;
  }

  private async priceCart(cart: {
    id: string;
    userId: string;
    branchId: string | null;
    updatedAt: Date;
    items: {
      id: string;
      medicineId: string;
      quantity: number;
      medicine: { name: string; requiresPrescription: boolean };
    }[];
  }): Promise<PricedCart> {
    if (cart.items.length === 0 || !cart.branchId) {
      return {
        id: cart.id,
        userId: cart.userId,
        branchId: cart.branchId,
        updatedAt: cart.updatedAt,
        items: [],
        subtotal: 0,
        isCheckoutable: false,
      };
    }

    // One query covers every line's price and stock — never a lookup per item.
    const inventories = await this.prisma.branchInventory.findMany({
      where: {
        branchId: cart.branchId,
        medicineId: { in: cart.items.map((item) => item.medicineId) },
      },
    });
    const byMedicine = new Map(inventories.map((row) => [row.medicineId, row]));

    const items: PricedCartItem[] = cart.items.map((item) => {
      const inventory = byMedicine.get(item.medicineId);
      const unitPrice = inventory ? Number(inventory.price) : 0;
      const quantityAvailable =
        inventory && inventory.isAvailable ? inventory.quantityAvailable : 0;

      return {
        id: item.id,
        medicineId: item.medicineId,
        name: item.medicine.name,
        quantity: item.quantity,
        unitPrice,
        lineTotal: round2(unitPrice * item.quantity),
        requiresPrescription: item.medicine.requiresPrescription,
        quantityAvailable,
        inStock: quantityAvailable >= item.quantity,
      };
    });

    return {
      id: cart.id,
      userId: cart.userId,
      branchId: cart.branchId,
      updatedAt: cart.updatedAt,
      items,
      subtotal: round2(items.reduce((sum, item) => sum + item.lineTotal, 0)),
      isCheckoutable: items.every((item) => item.inStock),
    };
  }
}

/** Money is Decimal(10,2) in Postgres; keep JS arithmetic at the same scale. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
