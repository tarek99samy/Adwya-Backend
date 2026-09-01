import { CartService } from './cart.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  CartBranchMismatchException,
  ControlledMedicineException,
  InsufficientStockException,
  MedicineNotStockedException,
} from '../common/exceptions/commerce.exceptions';

const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

const medicine = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'med-1',
  name: 'Panadol',
  requiresPrescription: false,
  isControlled: false,
  deletedAt: null,
  ...over,
});

const inventory = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'inv-1',
  branchId: BRANCH_A,
  medicineId: 'med-1',
  price: 25,
  quantityAvailable: 10,
  isAvailable: true,
  ...over,
});

describe('CartService', () => {
  let prisma: {
    cart: { upsert: jest.Mock; update: jest.Mock };
    cartItem: { upsert: jest.Mock; update: jest.Mock; delete: jest.Mock; deleteMany: jest.Mock };
    medicine: { findFirst: jest.Mock };
    branchInventory: { findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let cart: CartService;

  beforeEach(() => {
    prisma = {
      cart: { upsert: jest.fn(), update: jest.fn() },
      cartItem: {
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      medicine: { findFirst: jest.fn() },
      branchInventory: { findFirst: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    cart = new CartService(prisma as unknown as PrismaService);
  });

  /** The cart shape returned by the `include: { items: true }` reads. */
  const bareCart = (branchId: string | null, items: unknown[] = []) => ({
    id: 'cart-1',
    userId: 'user-1',
    branchId,
    updatedAt: new Date('2026-01-01'),
    items,
  });

  describe('addItem', () => {
    it('scopes an empty cart to the branch stocking the medicine', async () => {
      prisma.cart.upsert
        .mockResolvedValueOnce(bareCart(null))
        // second upsert is the getCart re-read at the end
        .mockResolvedValueOnce({
          ...bareCart(BRANCH_A),
          items: [{ id: 'ci-1', medicineId: 'med-1', quantity: 2, medicine: medicine() }],
        });
      prisma.medicine.findFirst.mockResolvedValue(medicine());
      prisma.branchInventory.findFirst.mockResolvedValue(inventory());
      prisma.branchInventory.findMany.mockResolvedValue([inventory()]);

      const result = await cart.addItem('user-1', { medicineId: 'med-1', quantity: 2 });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.branchId).toBe(BRANCH_A);
      expect(result.subtotal).toBe(50);
      expect(result.isCheckoutable).toBe(true);
    });

    it('rejects an item from a different branch instead of clearing the cart', async () => {
      prisma.cart.upsert.mockResolvedValue(
        bareCart(BRANCH_A, [{ id: 'ci-1', medicineId: 'med-9', quantity: 1 }]),
      );
      prisma.medicine.findFirst.mockResolvedValue(medicine());
      prisma.branchInventory.findFirst.mockResolvedValue(inventory({ branchId: BRANCH_B }));

      await expect(cart.addItem('user-1', { medicineId: 'med-1', quantity: 1 })).rejects.toThrow(
        CartBranchMismatchException,
      );
      // Nothing was written — the existing cart survives the rejection.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('blocks controlled medicines outright', async () => {
      prisma.cart.upsert.mockResolvedValue(bareCart(null));
      prisma.medicine.findFirst.mockResolvedValue(medicine({ isControlled: true }));

      await expect(cart.addItem('user-1', { medicineId: 'med-1', quantity: 1 })).rejects.toThrow(
        ControlledMedicineException,
      );
      expect(prisma.branchInventory.findFirst).not.toHaveBeenCalled();
    });

    it('refuses to exceed available stock', async () => {
      prisma.cart.upsert.mockResolvedValue(bareCart(null));
      prisma.medicine.findFirst.mockResolvedValue(medicine());
      prisma.branchInventory.findFirst.mockResolvedValue(inventory({ quantityAvailable: 3 }));

      await expect(cart.addItem('user-1', { medicineId: 'med-1', quantity: 5 })).rejects.toThrow(
        InsufficientStockException,
      );
    });

    it('counts the existing line when checking stock on a repeat add', async () => {
      prisma.cart.upsert.mockResolvedValue(
        bareCart(BRANCH_A, [{ id: 'ci-1', medicineId: 'med-1', quantity: 8 }]),
      );
      prisma.medicine.findFirst.mockResolvedValue(medicine());
      prisma.branchInventory.findFirst.mockResolvedValue(inventory({ quantityAvailable: 10 }));

      // 8 already in the cart + 5 more = 13 > 10 available.
      await expect(cart.addItem('user-1', { medicineId: 'med-1', quantity: 5 })).rejects.toThrow(
        InsufficientStockException,
      );
    });

    it('rejects a medicine no approved branch stocks', async () => {
      prisma.cart.upsert.mockResolvedValue(bareCart(null));
      prisma.medicine.findFirst.mockResolvedValue(medicine());
      prisma.branchInventory.findFirst.mockResolvedValue(null);

      await expect(cart.addItem('user-1', { medicineId: 'med-1', quantity: 1 })).rejects.toThrow(
        MedicineNotStockedException,
      );
    });

    it('rejects a soft-deleted medicine', async () => {
      prisma.cart.upsert.mockResolvedValue(bareCart(null));
      prisma.medicine.findFirst.mockResolvedValue(null);

      await expect(cart.addItem('user-1', { medicineId: 'gone', quantity: 1 })).rejects.toThrow(
        MedicineNotStockedException,
      );
    });
  });

  describe('getCart', () => {
    it('prices lines off live branch inventory', async () => {
      prisma.cart.upsert.mockResolvedValue({
        ...bareCart(BRANCH_A),
        items: [
          { id: 'ci-1', medicineId: 'med-1', quantity: 2, medicine: medicine() },
          { id: 'ci-2', medicineId: 'med-2', quantity: 1, medicine: medicine({ id: 'med-2', name: 'Brufen' }) },
        ],
      });
      prisma.branchInventory.findMany.mockResolvedValue([
        inventory({ medicineId: 'med-1', price: 25 }),
        inventory({ medicineId: 'med-2', price: 10.5 }),
      ]);

      const result = await cart.getCart('user-1');

      expect(result.subtotal).toBe(60.5);
      expect(result.items).toHaveLength(2);
      expect(prisma.branchInventory.findMany).toHaveBeenCalledTimes(1); // no N+1
    });

    it('marks the cart uncheckoutable when a line went out of stock', async () => {
      prisma.cart.upsert.mockResolvedValue({
        ...bareCart(BRANCH_A),
        items: [{ id: 'ci-1', medicineId: 'med-1', quantity: 5, medicine: medicine() }],
      });
      prisma.branchInventory.findMany.mockResolvedValue([inventory({ quantityAvailable: 2 })]);

      const result = await cart.getCart('user-1');

      expect(result.items[0].inStock).toBe(false);
      expect(result.isCheckoutable).toBe(false);
    });

    it('marks a line out of stock when the branch flags it unavailable', async () => {
      prisma.cart.upsert.mockResolvedValue({
        ...bareCart(BRANCH_A),
        items: [{ id: 'ci-1', medicineId: 'med-1', quantity: 1, medicine: medicine() }],
      });
      prisma.branchInventory.findMany.mockResolvedValue([inventory({ isAvailable: false })]);

      const result = await cart.getCart('user-1');

      expect(result.items[0].quantityAvailable).toBe(0);
      expect(result.isCheckoutable).toBe(false);
    });

    it('returns an empty, uncheckoutable cart when there are no items', async () => {
      prisma.cart.upsert.mockResolvedValue({ ...bareCart(null), items: [] });

      const result = await cart.getCart('user-1');

      expect(result.items).toEqual([]);
      expect(result.subtotal).toBe(0);
      expect(result.isCheckoutable).toBe(false);
      expect(prisma.branchInventory.findMany).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('releases the branch scope when the last line goes', async () => {
      prisma.cart.upsert
        .mockResolvedValueOnce(bareCart(BRANCH_A, [{ id: 'ci-1', medicineId: 'med-1', quantity: 1 }]))
        .mockResolvedValueOnce({ ...bareCart(null), items: [] });

      await cart.removeItem('user-1', 'ci-1');

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: 'ci-1' } });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: { branchId: null },
      });
    });

    it('keeps the branch scope while other lines remain', async () => {
      prisma.cart.upsert
        .mockResolvedValueOnce(
          bareCart(BRANCH_A, [
            { id: 'ci-1', medicineId: 'med-1', quantity: 1 },
            { id: 'ci-2', medicineId: 'med-2', quantity: 1 },
          ]),
        )
        .mockResolvedValueOnce({ ...bareCart(BRANCH_A), items: [] });
      prisma.branchInventory.findMany.mockResolvedValue([]);

      await cart.removeItem('user-1', 'ci-1');

      expect(prisma.cart.update).not.toHaveBeenCalled();
    });
  });
});
