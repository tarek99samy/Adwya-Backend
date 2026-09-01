import { Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { OrderStatus, PrescriptionStatus } from '../common/enums';
import {
  BranchUnavailableException,
  CartEmptyException,
  ControlledMedicineException,
  IllegalOrderTransitionException,
  InsufficientStockException,
  InvalidCouponException,
  NotBranchStaffException,
  OrderNotCancellableException,
  OutsideDeliveryAreaException,
  PrescriptionNotApprovedException,
  PrescriptionRequiredException,
} from '../common/exceptions/commerce.exceptions';

const USER = 'user-1';
const BRANCH = 'branch-a';

const CHECKOUT_DTO = {
  branchId: BRANCH,
  addressId: 'addr-1',
  paymentMethodId: 'pm-1',
};

const medicine = (over: Record<string, unknown> = {}) => ({
  id: 'med-1',
  name: 'Panadol',
  requiresPrescription: false,
  isControlled: false,
  ...over,
});

describe('OrdersService', () => {
  let prisma: Record<string, any>;
  let orders: OrdersService;
  /** Producer stub — the real one enqueues to BullMQ. */
  let notifications: { enqueue: jest.Mock };
  /** The transaction client handed to the $transaction callback. */
  let tx: Record<string, any>;

  beforeEach(() => {
    // Checkout logs a line per order; keep the test output readable.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    tx = {
      branchInventory: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ quantityAvailable: 0, isAvailable: true }),
      },
      order: {
        create: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ADW-TEST', items: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'ADW-TEST',
          paymentMethodId: 'pm-1',
        }),
      },
      stockMovement: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      prescription: { create: jest.fn().mockResolvedValue({}) },
      couponUsage: { create: jest.fn().mockResolvedValue({}), count: jest.fn() },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({}) },
      cart: { update: jest.fn().mockResolvedValue({}) },
      orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      paymentMethod: { findUnique: jest.fn().mockResolvedValue({ code: 'CASH' }) },
      payment: { updateMany: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      cart: { findUnique: jest.fn() },
      pharmacyBranch: { findFirst: jest.fn() },
      address: { findFirst: jest.fn() },
      paymentMethod: { findFirst: jest.fn() },
      branchInventory: { findMany: jest.fn() },
      coupon: { findUnique: jest.fn() },
      couponUsage: { count: jest.fn().mockResolvedValue(0) },
      order: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      pharmacyStaff: { findFirst: jest.fn() },
      // Callback form for checkout/transition; array form for the paginated reads.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function' ? (arg as (c: unknown) => unknown)(tx) : Promise.resolve([]),
      ),
    };

    notifications = { enqueue: jest.fn().mockResolvedValue(undefined) };
    orders = new OrdersService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  /** Wires up the "everything is fine" reads that precede the transaction. */
  function happyPath(over: { items?: unknown[]; zones?: unknown[]; inventory?: unknown[] } = {}) {
    prisma.cart.findUnique.mockResolvedValue({
      id: 'cart-1',
      branchId: BRANCH,
      items: over.items ?? [{ medicineId: 'med-1', quantity: 2, medicine: medicine() }],
    });
    prisma.pharmacyBranch.findFirst.mockResolvedValue({
      id: BRANCH,
      deliveryZones: over.zones ?? [{ id: 'z1', name: 'flat', areaPolygon: null, deliveryFee: 20 }],
    });
    prisma.address.findFirst.mockResolvedValue({
      id: 'addr-1',
      latitude: 30.05,
      longitude: 31.25,
      building: '5',
      street: 'Nile St',
      area: 'Zamalek',
      city: 'Cairo',
      governorate: 'Cairo',
    });
    prisma.paymentMethod.findFirst.mockResolvedValue({ id: 'pm-1', code: 'CASH' });
    prisma.branchInventory.findMany.mockResolvedValue(
      over.inventory ?? [
        { medicineId: 'med-1', price: 25, quantityAvailable: 10, isAvailable: true },
      ],
    );
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      customerId: USER,
      branchId: BRANCH,
      items: [],
    });
  }

  // -------------------------------------------------------------------------
  // Checkout — happy path
  // -------------------------------------------------------------------------

  describe('checkout', () => {
    it('prices from live inventory and snapshots onto the order', async () => {
      happyPath();

      await orders.checkout(USER, CHECKOUT_DTO);

      const created = tx.order.create.mock.calls[0][0].data;
      expect(created.subtotal).toBe(50); // 2 x 25
      expect(created.deliveryFee).toBe(20);
      expect(created.total).toBe(70);
      expect(created.status).toBe(OrderStatus.PENDING_CONFIRMATION);
      expect(created.prescriptionStatus).toBe(PrescriptionStatus.NOT_REQUIRED);
      // Name and price are frozen onto the line, not left to a live lookup.
      expect(created.items.create[0]).toMatchObject({
        medicineNameSnapshot: 'Panadol',
        unitPriceSnapshot: 25,
        quantity: 2,
        subtotal: 50,
      });
    });

    it('decrements stock with a guarded conditional update', async () => {
      happyPath();

      await orders.checkout(USER, CHECKOUT_DTO);

      expect(tx.branchInventory.updateMany).toHaveBeenCalledWith({
        where: {
          branchId: BRANCH,
          medicineId: 'med-1',
          isAvailable: true,
          quantityAvailable: { gte: 2 },
        },
        data: { quantityAvailable: { decrement: 2 } },
      });
    });

    it('writes a negative SALE stock movement per line', async () => {
      happyPath();

      await orders.checkout(USER, CHECKOUT_DTO);

      expect(tx.stockMovement.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            medicineId: 'med-1',
            movementType: 'SALE',
            quantity: -2,
            referenceType: 'ORDER',
            referenceId: 'order-1',
          }),
        ],
      });
    });

    it('enqueues an ORDER_PLACED notification outside the transaction', async () => {
      happyPath();

      await orders.checkout(USER, CHECKOUT_DTO);

      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER,
          templateCode: 'ORDER_PLACED',
          type: 'ORDER_UPDATE',
        }),
      );
    });

    it('still completes checkout when enqueueing fails', async () => {
      happyPath();
      // The real service swallows this; the guarantee is that a queue outage
      // never costs the customer their order.
      notifications.enqueue.mockRejectedValue(new Error('redis down'));

      await expect(orders.checkout(USER, CHECKOUT_DTO)).resolves.toBeDefined();
      expect(tx.order.create).toHaveBeenCalled();
    });

    it('empties the cart on success', async () => {
      happyPath();

      await orders.checkout(USER, CHECKOUT_DTO);

      expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
      expect(tx.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: { branchId: null },
      });
    });

    // -----------------------------------------------------------------------
    // Checkout — the failure paths the roadmap calls out
    // -----------------------------------------------------------------------

    it('rejects an empty cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart-1', branchId: null, items: [] });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(CartEmptyException);
    });

    it('rejects a body whose branch disagrees with the cart scope', async () => {
      happyPath();
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        branchId: 'some-other-branch',
        items: [{ medicineId: 'med-1', quantity: 1, medicine: medicine() }],
      });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        BranchUnavailableException,
      );
    });

    it('rejects a controlled medicine that slipped into the cart', async () => {
      happyPath({
        items: [{ medicineId: 'med-1', quantity: 1, medicine: medicine({ isControlled: true }) }],
      });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        ControlledMedicineException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when a line went out of stock between cart and checkout', async () => {
      happyPath({
        inventory: [{ medicineId: 'med-1', price: 25, quantityAvailable: 1, isAvailable: true }],
      });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        InsufficientStockException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('aborts the transaction when the guarded decrement loses a race', async () => {
      happyPath();
      // Passed the pre-check, then another checkout took the last units.
      tx.branchInventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        InsufficientStockException,
      );
      expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('requires prescription images when the cart holds an Rx medicine', async () => {
      happyPath({
        items: [
          { medicineId: 'med-1', quantity: 1, medicine: medicine({ requiresPrescription: true }) },
        ],
      });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        PrescriptionRequiredException,
      );
    });

    it('enters PENDING_REVIEW and records the prescription when images are supplied', async () => {
      happyPath({
        items: [
          { medicineId: 'med-1', quantity: 1, medicine: medicine({ requiresPrescription: true }) },
        ],
      });

      await orders.checkout(USER, {
        ...CHECKOUT_DTO,
        prescriptionImageUrls: ['https://cdn/rx1.jpg'],
      });

      expect(tx.order.create.mock.calls[0][0].data.prescriptionStatus).toBe(
        PrescriptionStatus.PENDING_REVIEW,
      );
      expect(tx.prescription.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          imageUrls: ['https://cdn/rx1.jpg'],
          status: PrescriptionStatus.PENDING_REVIEW,
        },
      });
    });

    it('rejects an address outside every delivery zone', async () => {
      happyPath({
        zones: [
          {
            id: 'z1',
            name: 'downtown',
            areaPolygon: JSON.stringify({
              type: 'Polygon',
              coordinates: [
                [
                  [31.2, 30.0],
                  [31.3, 30.0],
                  [31.3, 30.1],
                  [31.2, 30.1],
                  [31.2, 30.0],
                ],
              ],
            }),
            deliveryFee: 15,
          },
        ],
      });
      prisma.address.findFirst.mockResolvedValue({
        id: 'addr-1',
        latitude: 31.5, // well outside the square
        longitude: 35.0,
        building: null,
        street: 'Far St',
        area: 'Elsewhere',
        city: 'Aswan',
        governorate: 'Aswan',
      });

      await expect(orders.checkout(USER, CHECKOUT_DTO)).rejects.toThrow(
        OutsideDeliveryAreaException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Coupons
  // -------------------------------------------------------------------------

  describe('coupons', () => {
    const validCoupon = (over: Record<string, unknown> = {}) => ({
      id: 'c1',
      code: 'SAVE10',
      isActive: true,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrderAmount: null,
      maxUses: null,
      maxUsesPerUser: null,
      validFrom: new Date('2020-01-01'),
      validTo: new Date('2100-01-01'),
      ...over,
    });

    it('applies a percentage discount to the subtotal only, not the delivery fee', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(validCoupon());

      await orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'SAVE10' });

      const created = tx.order.create.mock.calls[0][0].data;
      expect(created.subtotal).toBe(50);
      expect(created.discountTotal).toBe(5); // 10% of 50
      expect(created.total).toBe(65); // 50 - 5 + 20 delivery
    });

    it('caps a fixed discount at the subtotal so the total never goes negative', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(
        validCoupon({ discountType: 'FIXED', discountValue: 500 }),
      );

      await orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'BIG' });

      const created = tx.order.create.mock.calls[0][0].data;
      expect(created.discountTotal).toBe(50);
      expect(created.total).toBe(20); // delivery fee only
    });

    it('writes CouponUsage inside the checkout transaction', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(validCoupon());

      await orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'SAVE10' });

      expect(tx.couponUsage.create).toHaveBeenCalledWith({
        data: { couponId: 'c1', userId: USER, orderId: 'order-1' },
      });
    });

    it('rejects an unknown or inactive code', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(null);

      await expect(
        orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'NOPE' }),
      ).rejects.toThrow(InvalidCouponException);
    });

    it('rejects a code outside its validity window', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(
        validCoupon({ validTo: new Date('2020-06-01') }),
      );

      await expect(
        orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'OLD' }),
      ).rejects.toThrow(InvalidCouponException);
    });

    it('enforces minOrderAmount against the subtotal', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(validCoupon({ minOrderAmount: 200 }));

      await expect(
        orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'SAVE10' }),
      ).rejects.toThrow(InvalidCouponException);
    });

    it('enforces the per-user use limit', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(validCoupon({ maxUsesPerUser: 1 }));
      prisma.couponUsage.count.mockResolvedValue(1);

      await expect(
        orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'SAVE10' }),
      ).rejects.toThrow(InvalidCouponException);
    });

    it('re-counts inside the transaction so the last use cannot be double-spent', async () => {
      happyPath();
      prisma.coupon.findUnique.mockResolvedValue(validCoupon({ maxUses: 1 }));
      prisma.couponUsage.count.mockResolvedValue(0); // pre-check passes
      tx.couponUsage.count.mockResolvedValue(2); // a rival checkout got there first

      await expect(
        orders.checkout(USER, { ...CHECKOUT_DTO, couponCode: 'SAVE10' }),
      ).rejects.toThrow(InvalidCouponException);
    });
  });

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  describe('transition', () => {
    const orderRow = (over: Record<string, unknown> = {}) => ({
      id: 'order-1',
      status: OrderStatus.PENDING_CONFIRMATION,
      prescriptionStatus: PrescriptionStatus.NOT_REQUIRED,
      branchId: BRANCH,
      customerId: USER,
      items: [{ medicineId: 'med-1', quantity: 2 }],
      ...over,
    });

    it('rejects an illegal jump', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await expect(
        orders.transition('order-1', 'staff-1', { status: OrderStatus.DELIVERED }),
      ).rejects.toThrow(IllegalOrderTransitionException);
    });

    it('refuses a caller who is not staff at the branch', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.pharmacyStaff.findFirst.mockResolvedValue(null);

      await expect(
        orders.transition('order-1', 'outsider', { status: OrderStatus.CONFIRMED }),
      ).rejects.toThrow(NotBranchStaffException);
    });

    it('blocks forward progress while a prescription is under review', async () => {
      prisma.order.findUnique.mockResolvedValue(
        orderRow({ prescriptionStatus: PrescriptionStatus.PENDING_REVIEW }),
      );
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await expect(
        orders.transition('order-1', 'staff-1', { status: OrderStatus.CONFIRMED }),
      ).rejects.toThrow(PrescriptionNotApprovedException);
    });

    it('still allows rejecting a prescription-gated order', async () => {
      prisma.order.findUnique.mockResolvedValue(
        orderRow({ prescriptionStatus: PrescriptionStatus.PENDING_REVIEW }),
      );
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'PHARMACIST' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.REJECTED });

      expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    });

    it('restores stock and logs a RETURN movement when an order is cancelled', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow({ status: OrderStatus.CONFIRMED }));
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.CANCELLED });

      expect(tx.branchInventory.updateMany).toHaveBeenCalledWith({
        where: { branchId: BRANCH, medicineId: 'med-1' },
        data: { quantityAvailable: { increment: 2 } },
      });
      expect(tx.stockMovement.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ movementType: 'RETURN', quantity: 2 })],
      });
    });

    it('notifies the customer when the order is confirmed', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.CONFIRMED });

      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, templateCode: 'ORDER_CONFIRMED' }),
      );
    });

    it('stays quiet on PREPARING — not news worth a push', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow({ status: OrderStatus.CONFIRMED }));
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.PREPARING });

      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('does not touch stock on forward progress', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow());
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'MANAGER' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.CONFIRMED });

      expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
    });

    it('settles a cash order when it is delivered', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow({ status: OrderStatus.OUT_FOR_DELIVERY }));
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'COURIER' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.DELIVERED });

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: { status: 'PAID' },
      });
    });

    it('leaves an online payment alone on delivery', async () => {
      prisma.order.findUnique.mockResolvedValue(orderRow({ status: OrderStatus.OUT_FOR_DELIVERY }));
      prisma.pharmacyStaff.findFirst.mockResolvedValue({ id: 's1', role: 'COURIER' });
      tx.paymentMethod.findUnique.mockResolvedValue({ code: 'INSTAPAY' });

      await orders.transition('order-1', 'staff-1', { status: OrderStatus.DELIVERED });

      expect(tx.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cancelAsCustomer', () => {
    it('allows self-cancel before confirmation', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_CONFIRMATION,
        customerId: USER,
        branchId: BRANCH,
        items: [{ medicineId: 'med-1', quantity: 2 }],
      });

      await orders.cancelAsCustomer('order-1', USER, { cancelReason: 'changed my mind' });

      expect(tx.branchInventory.updateMany).toHaveBeenCalled(); // stock returned
      expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    });

    it('refuses once the pharmacy has confirmed', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        customerId: USER,
        branchId: BRANCH,
        items: [],
      });

      await expect(orders.cancelAsCustomer('order-1', USER, {})).rejects.toThrow(
        OrderNotCancellableException,
      );
    });

    it('will not let one customer cancel an order belonging to someone else', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING_CONFIRMATION,
        customerId: 'someone-else',
        branchId: BRANCH,
        items: [],
      });

      await expect(orders.cancelAsCustomer('order-1', USER, {})).rejects.toThrow();
    });
  });
});
