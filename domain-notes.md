# Adwya — Domain Handoff Notes

Companion to `schema.prisma`. This covers the business rules, workflows, and
validation constraints the schema itself can't express — needed for writing
DTOs, validators, and service logic in NestJS.

## Stack assumptions
- NestJS (modular monolith) + Prisma + PostgreSQL (PostGIS, pg_trgm) + Redis + BullMQ
- `class-validator` / `class-transformer` for DTOs
- Auth: phone-based (OTP or password), JWT

## Module boundaries (suggested)
`auth`, `users`, `rbac` (profiles/permissions), `catalog` (medicine/brand/category/etc.),
`pharmacies` (chain/branch/staff/warehouse), `inventory` (batch/branch-inventory/stock-movement),
`cart`, `orders`, `prescriptions`, `payments`, `refunds`, `promotions` (coupon/campaign/promotion),
`reviews`, `notifications`, `delivery` (delivery-run), `audit`.

---

## Core workflows

### 1. Checkout (highest-risk flow — needs the most test coverage)
1. Validate cart belongs to one `branchId` (cart is branch-scoped — reject mixed-branch checkout at the API layer, not just in DB).
2. For each cart item: check `BranchInventory.isAvailable` and `quantityAvailable >= quantity`.
3. If any `Medicine.requiresPrescription = true` is in the cart, order enters with
   `prescriptionStatus = PENDING_REVIEW` and **must not** progress past
   `PENDING_CONFIRMATION` until a `PHARMACIST`-role staff member approves the
   `Prescription` record. `isControlled = true` medicines should be blocked from
   cart/checkout entirely at the API layer (config-level exclusion, not just a flag).
4. Run everything below inside **one Prisma `$transaction`**:
   - Atomically decrement `BranchInventory.quantityAvailable` per line item
     (conditional `UPDATE ... WHERE quantity_available >= :qty`, or a Postgres
     function like the earlier draft's `decrement_pharmacy_stock` — recreate it
     scoped to `branch_inventory`). Abort the whole transaction (409) if any
     line fails.
   - Write a `StockMovement` row per line item (`movementType = SALE`,
     `referenceType = "ORDER"`, `referenceId = order.id`).
   - Create `Order` + `OrderItem` rows. **Snapshot** `medicineNameSnapshot` and
     `unitPriceSnapshot` from `BranchInventory.price` at this moment — never
     recompute from live inventory/price later.
   - Create `Payment` (status `PENDING`) linked to the chosen `PaymentMethod`.
   - Create `OrderStatusHistory` row for the initial status.
5. Outside the transaction (async, via BullMQ): send WhatsApp/FCM order-confirmation notification.

### 2. Prescription review
- Pharmacist (staff with `role = PHARMACIST` at the order's branch) reviews
  uploaded `Prescription.imageUrls`.
- Approve → `Prescription.status = APPROVED`, `reviewedById`, `reviewedAt` set;
  `Order.prescriptionStatus = APPROVED`; order can now move to `CONFIRMED`.
- Reject → `Order.status = REJECTED`, stock must be **restored** (reverse the
  `SALE` stock movement with an `ADJUSTMENT` or `RETURN` movement type and
  increment `BranchInventory` back).

### 3. Order status state machine
```
PENDING_CONFIRMATION → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
                     ↘ REJECTED         ↘ CANCELLED
```
- Enforce valid transitions in the service layer (e.g. a small allowed-transitions
  map), not just via the enum — the enum doesn't prevent illegal jumps like
  `PENDING_CONFIRMATION → DELIVERED`.
- Every transition writes an `OrderStatusHistory` row (`changedById` = acting
  staff/system user).
- `CONFIRMED → PREPARING` should also be when a `DeliveryRun` is either created
  (if courier assignment happens at this stage) or when an already-created
  `DeliveryRun` is updated.
- Cancellation after `CONFIRMED` must reverse stock (same pattern as prescription rejection).

### 4. Delivery run
- Branch staff assigns a `PharmacyStaff` with `role = COURIER` to the order →
  creates `DeliveryRun` (`assignedAt = now()`).
- Courier app pings `currentLocation` periodically (throttle this — don't write
  to Postgres on every GPS tick; buffer in Redis and flush every N seconds, or
  publish to a websocket channel and only persist on pickup/delivery).
- `pickedUpAt` set when courier marks "picked up" → order status `OUT_FOR_DELIVERY`.
- `deliveredAt` set on delivery confirmation → order status `DELIVERED`,
  `Order.deliveredAt` also set, `Payment.status` updated if cash-on-delivery.

### 5. Payments
- MVP methods (`CASH`, `VISA_ON_DELIVERY`, `INSTAPAY`) are seeded rows in
  `PaymentMethod` with `isActive = true`; Paymob card/wallet rows exist but
  `isActive = false` until that phase.
- Webhook handling: verify signature → log to `PaymentWebhook` regardless of
  validity → if valid and not already processed (check `providerTransactionId`
  uniqueness on `PaymentTransaction`), update `Payment.status` and
  `Order.paymentStatus`. This must be idempotent — a webhook can arrive twice.
- Refunds reference `PaymentTransaction`, not just `Order`, so a specific
  payment attempt can be reversed and reconciled with the provider.

### 6. Coupons
- Validate at checkout: `isActive`, `validFrom <= now <= validTo`,
  `minOrderAmount` against cart subtotal, `maxUses` against total
  `CouponUsage` count, `maxUsesPerUser` against per-user count. Write
  `CouponUsage` inside the same checkout transaction to prevent race conditions
  on limited-use coupons (two simultaneous checkouts both passing the "uses
  left" check).

---

## Validation rules for DTOs

| Field | Rule |
|---|---|
| `User.phone` | Egyptian format `+20\d{10}` or `01\d{9}` — pick one canonical format and normalize on input |
| `Review.rating` | 1–5 integer (DB also enforces via CHECK constraint — add in raw SQL migration since Prisma has no native check-constraint support) |
| `Order` checkout DTO | Never accept client-supplied prices/totals — server recomputes from `BranchInventory` every time |
| `Coupon.discountValue` | If `discountType = PERCENTAGE`, must be 0–100; if `FIXED`, must be > 0 |
| `Batch` | Exactly one of `warehouseId` / `branchId` must be set, matching `locationType` — enforce in service layer AND as a raw SQL CHECK constraint |
| `PrescriptionUpload` | Limit image count/size; validate MIME type server-side, not just extension |
| `Address.location` / `PharmacyBranch.location` | Validate lat/lng ranges before constructing the PostGIS point |

## Indexes / constraints not expressible in `schema.prisma`
Add these in a raw SQL migration after `prisma migrate dev`, same pattern as
before — GIST indexes on every geography column, `pg_trgm` GIN index on
`medicines.name` / `generic_name` for interim search, and CHECK constraints for
`reviews.rating` and `batches` location-type consistency.

## Open items intentionally deferred (per your call — revisit before scaling past pilot)
- Whether `NotificationStatus` / `PaymentStatus`-as-tables (vs. enums, as modeled here) is needed for admin-configurability.
- Delivery fee calculation: flat per `DeliveryZone` vs. distance-based via `ST_Distance` — schema supports either; logic isn't written yet.
- Whether the profile/permission override system (`UserPermission` deny/grant on top of `ProfilePermission`) needs conflict-resolution rules (does a user-level deny beat a profile-level grant?) — decide before building the permission-check guard, or you'll have to redo it later.
