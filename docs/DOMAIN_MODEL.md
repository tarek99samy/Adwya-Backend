# Domain model

Enums, state machines and the business rules the API enforces. These are the
rules a client cannot talk its way around — the server checks all of them.

---

## Actors

| Actor | `userType` | How they are identified |
| --- | --- | --- |
| Customer | `CUSTOMER` | Signs up through the app |
| Pharmacy staff | `PHARMACY_STAFF` | Created by their pharmacy; a `PharmacyStaff` row links them to exactly one branch with one role |
| Platform admin | `ADMIN` | Created by seed or another admin; holds RBAC permissions |

Authorisation comes from two independent systems:

- **Branch membership** — most pharmacy endpoints ask "is this user staff at
  *this* branch?", and some ask for a specific `PharmacyStaffRole`. This is what
  stops one pharmacy reading another's orders or stock.
- **RBAC permissions** — platform-wide capabilities such as `refunds.create`,
  held via a profile (`ADMIN`, `SUPPORT`, `FINANCE`, `COMPLIANCE`,
  `CATALOG_MANAGER`) or granted per user.

A pharmacy owner has neither admin permissions nor access to another pharmacy.

---

## Enums

Send and expect these exact strings.

### `OrderStatus`
`PENDING_CONFIRMATION` · `CONFIRMED` · `PREPARING` · `OUT_FOR_DELIVERY` ·
`DELIVERED` · `CANCELLED` · `REJECTED`

### `PaymentStatus`
`PENDING` · `PAID` · `FAILED` · `REFUNDED` · `PARTIALLY_REFUNDED`

### `PrescriptionStatus`
`NOT_REQUIRED` · `PENDING_REVIEW` · `APPROVED` · `REJECTED`

### `BranchStatus`
`PENDING_APPROVAL` · `APPROVED` · `REJECTED` · `SUSPENDED`

Only `APPROVED` branches are ever visible to customers or can take orders.

### `PharmacyStaffRole`
`OWNER` · `MANAGER` · `PHARMACIST` · `STAFF` · `COURIER`

`PHARMACIST` is not cosmetic — **only a pharmacist may approve or reject a
prescription**, deliberately excluding `OWNER` and `MANAGER`, because that is a
regulated clinical judgement rather than an administrative one.

### `RefundStatus`
`PENDING` · `APPROVED` · `REJECTED` · `COMPLETED`

### `StockMovementType`
`WAREHOUSE_RECEIPT` · `TRANSFER_TO_BRANCH` · `SALE` · `RETURN` · `DAMAGE` ·
`EXPIRY` · `ADJUSTMENT`

### `UserType`
`CUSTOMER` · `PHARMACY_STAFF` · `ADMIN`

### `DiscountType`
`PERCENTAGE` · `FIXED`

### `BatchLocationType`
`WAREHOUSE` · `BRANCH`

---

## Order state machine

The enum alone would permit nonsense such as `PENDING_CONFIRMATION → DELIVERED`.
An explicit transition map is what actually governs the order:

```
PENDING_CONFIRMATION ──> CONFIRMED ──> PREPARING ──> OUT_FOR_DELIVERY ──> DELIVERED
        │                    │              │                │
        ├──> REJECTED        └──────────────┴────────────────┴──> CANCELLED
        └──> CANCELLED
```

| From | Allowed next |
| --- | --- |
| `PENDING_CONFIRMATION` | `CONFIRMED`, `REJECTED`, `CANCELLED` |
| `CONFIRMED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `OUT_FOR_DELIVERY`, `CANCELLED` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `CANCELLED` |
| `DELIVERED` | *terminal* |
| `CANCELLED` | *terminal* |
| `REJECTED` | *terminal* |

Anything else is `409 ILLEGAL_ORDER_TRANSITION` carrying `from` and `to`.

Rules layered on top:

- **The customer can only cancel at `PENDING_CONFIRMATION`.** After that it is
  `409 ORDER_NOT_CANCELLABLE`. Staff can still cancel later.
- **A pending prescription freezes forward progress.** While
  `prescriptionStatus` is `PENDING_REVIEW`, every transition except `CANCELLED`
  and `REJECTED` fails with `409 PRESCRIPTION_NOT_APPROVED`. Cancelling always
  stays reachable.
- **Leaving to `CANCELLED` or `REJECTED` restores stock**, and writes a `RETURN`
  movement per line — but only from a live status. Terminal orders have already
  been settled.
- **`DELIVERED` settles pay-on-delivery.** `CASH` and `VISA_ON_DELIVERY` flip to
  `paymentStatus: PAID` at the moment of delivery.
- `OUT_FOR_DELIVERY` is also reachable by the courier calling
  `POST /v1/orders/:id/delivery/pickup`, which moves the order and stamps the
  delivery run in one transaction.

---

## Prescription gating

1. Any cart line whose medicine has `requiresPrescription: true` makes the whole
   order prescription-gated.
2. Checkout then **requires** `prescriptionImageUrls` — otherwise
   `400 PRESCRIPTION_REQUIRED` listing the offending `medicineNames`.
3. The order is created with `prescriptionStatus: PENDING_REVIEW` and cannot
   move forward until a **pharmacist at that branch** approves it.
4. Approval unblocks the order; it stays at `PENDING_CONFIRMATION` for staff to
   confirm.
5. Rejection kills the order (`REJECTED`), restores stock and records the reason.

Orders with no Rx lines are created `NOT_REQUIRED` and skip all of this.

**Controlled medicines** (`isControlled: true`) are a separate, harder rule: they
are never orderable, even with a prescription, and are blocked at both cart and
checkout with `403 CONTROLLED_MEDICINE`. They remain browsable in the catalogue.

---

## Cart rules

- **One branch per cart.** The first item sets the scope; removing the last item
  releases it. A conflicting add is `409 CART_BRANCH_MISMATCH`, resolved by
  `POST /v1/cart/switch-branch` (clear + re-scope in one call).
- When the cart is unscoped, adding a medicine picks the **cheapest branch that
  has it in stock**.
- `quantity` is validated to **1–100** before any stock check.
- Adding an existing line **accumulates** rather than replacing; the combined
  quantity must fit in stock.
- The cart shows live prices and stock on every read, so an item can become
  `inStock: false` without the client doing anything.

---

## Pricing and money

- Money is `DECIMAL(10,2)`. Compute in minor units or a decimal type client-side;
  never with floats. See the serialization warning in
  [BACKEND_FOR_FLUTTER.md §4.2](BACKEND_FOR_FLUTTER.md#42-money-and-coordinates-are-sometimes-strings).
- **The client never sends prices.** Checkout recomputes every line from live
  branch inventory and snapshots it onto the order
  (`unitPriceSnapshot`, `medicineNameSnapshot`), so a later price or name change
  never rewrites history.
- `total = max(0, subtotal − discountTotal) + deliveryFee`. A coupon can take an
  order to zero but never negative.
- The delivery fee comes from the **cheapest delivery zone whose polygon
  contains the delivery point**. A branch may define a zone with no polygon as a
  catch-all. No match at all is `400 OUTSIDE_DELIVERY_AREA`.

### Coupons

Validated for: active, inside `validFrom`/`validTo`, `minOrderAmount` met, and
within both `maxUses` and `maxUsesPerUser`. The global limit is re-counted
**inside the checkout transaction**, so two simultaneous checkouts cannot both
consume the last use.

---

## Stock

- Checkout decrements stock with a **conditional update** — the quantity guard
  lives in the `WHERE` clause, so two concurrent checkouts for the last unit
  cannot both succeed. The loser's whole transaction aborts with
  `409 INSUFFICIENT_STOCK`. This is proven under real concurrency, not assumed.
- Every change writes a `StockMovement` row, so `stock_movements` and
  `branch_inventory` always reconcile.
- Quantity is **not** directly settable. Stock moves only through batch receipts,
  transfers, sales, returns, and explicit stock-take `ADJUSTMENT`s.
- A batch that is already expired is refused at goods-in.

---

## Payments

| Method code | Rail | Settles when |
| --- | --- | --- |
| `CASH` | Pay on delivery | Order reaches `DELIVERED` |
| `VISA_ON_DELIVERY` | Pay on delivery | Order reaches `DELIVERED` |
| `INSTAPAY` | Manual bank transfer | Branch staff confirm the reported reference |
| `PAYMOB_CARD` | Gateway redirect | Provider webhook — **inactive, stub only** |
| `PAYMOB_WALLET` | Gateway redirect | Provider webhook — **inactive, stub only** |

Webhook handling is deliberately ordered: **log the raw payload → verify the
signature → check idempotency → verify the amount → settle.** Every callback is
recorded whether or not its signature verified, `providerTransactionId` is
unique so replays are no-ops, and a `PAID` callback whose amount does not match
what is owed is parked unprocessed rather than settling the order.

---

## Reviews

One review per order, by the customer who placed it, only once the order is
`DELIVERED`. Writing one recomputes the branch's `ratingAvg` and `ratingCount`
in the same transaction. Moderators with `reviews.moderate` can delete a review,
which recomputes the aggregate again.

---

## Permissions

Seeded permission codes, and which endpoints require them:

| Code | Used by |
| --- | --- |
| `pharmacies.approve` | List pending branches; approve/reject a branch application |
| `pharmacies.suspend` | Suspend or reinstate an approved branch |
| `refunds.create` | Raise a refund |
| `refunds.read` | List/read refunds |
| `refunds.approve` | Move a refund through its state machine |
| `audit.read` | Read the audit log |
| `reviews.moderate` | Delete a review |

Also seeded but not yet wired to any route: `catalog.create`, `catalog.update`,
`catalog.delete`, `pharmacies.read`, `orders.read`, `orders.cancel`,
`payments.read`, `promotions.manage`, `users.read`, `users.update`,
`rbac.manage`. Admin catalogue CRUD is not built.

Seeded profiles: `ADMIN` (all 18), `SUPPORT` (7), `FINANCE` (5), `COMPLIANCE`
(5), `CATALOG_MANAGER` (4).

Permission checks are **deny-wins**: a per-user denial overrides a profile grant.

---

## Audit

Sensitive mutations write an `AuditLog` row with actor, entity, before/after
payloads and a redacted set of sensitive keys. Covered today: refunds, branch
approval, stock adjustment, pricing changes, prescription verdicts, order
transitions and manual payment confirmation. Readable via `GET /v1/admin/audit`
with `audit.read`.
