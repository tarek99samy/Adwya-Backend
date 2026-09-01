# API reference

Generated from the running server's OpenAPI document — do not hand-edit.
Regenerate after any route change; the machine-readable spec sits next to this
file at [`openapi.json`](openapi.json).

**Auth** column: `public` needs no token; `token` needs a valid bearer access token;
a permission code means the token must also carry that permission (see
[DOMAIN_MODEL.md](DOMAIN_MODEL.md#permissions)). Every route not marked `public`
answers `401` without a token — this was verified against the live server for all
66 product routes, not inferred.

**Limit** column: requests per minute per IP. Blank means the global default of
**50/min**. Exceeding it returns `429` with no response body.

## Auth

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/auth/login` | public | 20/min |  |
| POST | `/v1/auth/logout` | public | 20/min |  |
| GET | `/v1/auth/me` | token | 20/min | Sanity-check the global JwtAuthGuard wiring. Requires a valid token. |
| POST | `/v1/auth/refresh` | public | 20/min |  |
| POST | `/v1/auth/reset-password` | public | 20/min |  |
| POST | `/v1/auth/signup` | public | 20/min |  |
| POST | `/v1/auth/verify-user` | public | 20/min | Phase-1 forgot-password stub: phone → token. SMS/email wired in Phase 4.1. |

## Catalog

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/v1/catalog/brands` | public |  |  |
| GET | `/v1/catalog/categories` | public |  |  |
| GET | `/v1/catalog/medicines/{id}` | public |  |  |
| GET | `/v1/catalog/medicines` | public |  |  |

## Pharmacies

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/v1/pharmacies/branches/{id}` | public |  |  |
| GET | `/v1/pharmacies/branches` | public |  |  |

## Cart

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| DELETE | `/v1/cart/items/{id}` | token | 60/min |  |
| PATCH | `/v1/cart/items/{id}` | token | 60/min |  |
| POST | `/v1/cart/items` | token | 60/min |  |
| POST | `/v1/cart/switch-branch` | token | 60/min | Discards the cart and re-scopes it to the branch stocking the given |
| DELETE | `/v1/cart` | token | 60/min |  |
| GET | `/v1/cart` | token | 60/min |  |

## Orders

*Customer app + pharmacy dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/orders/{id}/cancel` | token |  | Customer withdrawing their own order, allowed only before confirmation. |
| POST | `/v1/orders/{id}/transition` | token |  | Staff-driven status change, validated against the allowed-transitions map. |
| GET | `/v1/orders/{id}` | token |  |  |
| GET | `/v1/orders/branch/{branchId}` | token |  | Branch-side order queue. Requires staff membership at that branch. |
| POST | `/v1/orders/checkout` | token | 10/min | Checkout. Tighter throttle than the rest of the API: this is the one |
| GET | `/v1/orders` | token |  | The caller's own order history. |

## Prescriptions

*Pharmacy dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| PATCH | `/v1/prescriptions/{id}` | token |  | Approve or reject. Rejection also kills the order and restores stock, so |
| GET | `/v1/prescriptions/branch/{branchId}` | token |  | Pharmacist review queue for one branch, oldest first. |

## Delivery

*Courier app + customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/orders/{id}/delivery/location` | token | 30/min | GPS tick from the courier app. Throttled to 30/min because every call is |
| POST | `/v1/orders/{id}/delivery/pickup` | token |  | Courier marks collection; also moves the order to OUT_FOR_DELIVERY. |
| GET | `/v1/orders/{id}/delivery` | token |  | Live tracking for the order's own customer. |
| POST | `/v1/orders/{id}/delivery` | token |  | Branch staff assigns a courier to a confirmed order. |

## Payments

*Customer app + pharmacy dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/v1/payments/branch/{branchId}/pending-transfers` | token |  | Queue of InstaPay references awaiting confirmation at one branch. |
| POST | `/v1/payments/intent` | token | 10/min | Starts a gateway payment. Rejected for cash / on-delivery / InstaPay. |
| POST | `/v1/payments/orders/{orderId}/instapay` | token |  | Customer reports the reference of an InstaPay transfer they already made. |
| GET | `/v1/payments/orders/{orderId}` | token |  | Payment detail for one order — its customer or the branch staff. |
| POST | `/v1/payments/transactions/{id}/confirm` | token |  | Branch staff confirms a reported transfer against the bank statement. |
| POST | `/v1/payments/webhooks/{provider}` | public | 300/min | Provider callback. |

## Reviews

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/orders/{orderId}/review` | token |  | One review per delivered order, by the customer who placed it. |
| GET | `/v1/pharmacies/branches/{branchId}/reviews` | public |  | Public branch reviews plus the rating aggregate. |
| DELETE | `/v1/reviews/{id}` | `reviews.moderate` |  | Moderation removal; also recomputes the branch rating. |
| GET | `/v1/reviews/mine` | token |  |  |

## Notifications

*Customer app*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| PATCH | `/v1/notifications/read-all` | token |  | Marks every unread notification read. |
| PATCH | `/v1/notifications/read` | token |  |  |
| GET | `/v1/notifications` | token |  |  |

## Inventory

*Pharmacy dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/inventory/batches` | token |  | Goods-in, at a warehouse or straight at a branch. |
| POST | `/v1/inventory/branches/{branchId}/adjust` | token |  | Stock-take correction; writes an ADJUSTMENT movement carrying the delta. |
| GET | `/v1/inventory/branches/{branchId}/expiring` | token |  | FEFO working list — batches nearest expiry first. |
| GET | `/v1/inventory/branches/{branchId}/movements/{medicineId}` | token |  | Movement ledger for one medicine at a branch. |
| GET | `/v1/inventory/branches/{branchId}` | token |  |  |
| PUT | `/v1/inventory/branches/{branchId}` | token |  | Sets shelf price / availability. Quantity is not settable here. |
| POST | `/v1/inventory/transfers` | token |  | Warehouse batch to branch shelf. |

## Onboarding

*Pharmacy dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/v1/pharmacies/{pharmacyId}/branches` | token |  | An existing pharmacy opens another branch (OWNER/MANAGER). |
| GET | `/v1/pharmacies/branches/{branchId}/staff` | token |  |  |
| POST | `/v1/pharmacies/branches/{branchId}/staff` | token |  |  |
| POST | `/v1/pharmacies/register` | public | 5/min | Public self-service registration — this is how a pharmacy with no account |

## AdminPharmacies

*Admin dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| PATCH | `/v1/admin/pharmacies/branches/{branchId}/review` | `pharmacies.approve` |  | Approving is what lets a branch appear in search and take orders. |
| PATCH | `/v1/admin/pharmacies/branches/{branchId}/status` | `pharmacies.suspend` |  | Suspend or reinstate a branch that was already approved. |
| GET | `/v1/admin/pharmacies/branches/pending` | `pharmacies.approve` |  |  |

## Refunds

*Admin dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/v1/refunds/{id}` | `refunds.read` |  |  |
| PATCH | `/v1/refunds/{id}` | `refunds.approve` |  | PENDING -> APPROVED -> COMPLETED, or -> REJECTED. |
| GET | `/v1/refunds` | `refunds.read` |  |  |
| POST | `/v1/refunds` | `refunds.create` |  |  |

## Audit

*Admin dashboard*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/v1/admin/audit/{entityType}/{entityId}` | `audit.read` |  |  |
| GET | `/v1/admin/audit` | `audit.read` |  |  |

## Health

*Infrastructure*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | public |  |  |
| GET | `/readyz` | public |  |  |

## Metrics

*Infrastructure*

| Method | Path | Auth | Limit | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/metrics` | public |  |  |

---

**67 operations** across 17 tags. 18 are public.
