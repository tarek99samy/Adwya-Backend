# Error contract

Every error from the API — validation, authorisation, domain rule, or crash —
comes back in one envelope, produced by `GlobalHttpExceptionFilter`.

```json
{
  "statusCode": 409,
  "timestamp": "2026-09-01T03:26:10.713Z",
  "path": "/v1/orders/checkout",
  "error": { }
}
```

The outer `statusCode` always matches the HTTP status. The interesting payload
is nested under **`error`**, and its shape depends on which kind of failure it is.

---

## The three shapes of `error`

### 1. Domain errors — branch on `code`

```json
{
  "statusCode": 403,
  "timestamp": "2026-09-01T03:26:10.713Z",
  "path": "/v1/cart/items",
  "error": {
    "message": "\"Tramadol 225\" is a controlled medicine and cannot be ordered through the app. Please visit the pharmacy in person.",
    "code": "CONTROLLED_MEDICINE"
  }
}
```

`code` is a stable identifier — **branch on it**. `message` is human-readable
English intended for display, but it is not a contract: it can be reworded or
localised without notice. Several codes add extra context fields; those are
listed in the table below.

### 2. Validation errors — `message` is an array

```json
{
  "statusCode": 400,
  "timestamp": "2026-09-01T03:26:13.128Z",
  "path": "/v1/cart/items",
  "error": {
    "message": [
      "property bogus should not exist",
      "medicineId must be a UUID",
      "quantity must not be less than 1"
    ],
    "error": "Bad Request",
    "statusCode": 400
  }
}
```

There is **no `code`** here, and `message` is a `List<String>` rather than a
`String`. These come from the global validation pipe, which is strict: unknown
properties are rejected outright rather than stripped.

### 3. Framework errors — plain message, no code

```json
{
  "statusCode": 401,
  "timestamp": "2026-09-01T03:26:13.141Z",
  "path": "/v1/orders",
  "error": {
    "message": "Authentication required",
    "error": "Unauthorized",
    "statusCode": 401
  }
}
```

`401`, `404` on an unknown route, and `500` look like this.

**`429` (rate limited) returns no body at all.** Do not try to parse it.

---

## Handling all three safely

```dart
class ApiError {
  final int status;
  final String? code;        // null for validation/framework errors
  final List<String> messages;
  final Map<String, dynamic> context;  // extra fields such as `available`

  factory ApiError.from(int status, dynamic body) {
    if (body is! Map || body['error'] is! Map) {
      return ApiError._(status, null, const ['Something went wrong'], const {});
    }
    final e = Map<String, dynamic>.from(body['error'] as Map);
    final raw = e['message'];
    final messages = raw is List
        ? raw.map((x) => x.toString()).toList()
        : [raw?.toString() ?? 'Something went wrong'];
    final context = Map<String, dynamic>.from(e)
      ..remove('message')..remove('code')..remove('error')..remove('statusCode');
    return ApiError._(status, e['code'] as String?, messages, context);
  }

  ApiError._(this.status, this.code, this.messages, this.context);
}
```

Rule of thumb: **`code` drives behaviour, `messages` drive display.** If `code`
is null, the failure is either a client bug (validation) or a session problem
(401) — neither needs a domain-specific branch.

---

## Every domain code

Grouped by where you will meet it. "Extra fields" appear alongside `message` and
`code` inside `error`.

### Cart

| Code | Status | Extra fields | What it means |
| --- | --- | --- | --- |
| `CART_BRANCH_MISMATCH` | 409 | `currentBranchId`, `incomingBranchId` | The cart is scoped to another pharmacy. Prompt, then `POST /v1/cart/switch-branch`. |
| `MEDICINE_NOT_STOCKED` | 404 | `medicineId` | No approved branch stocks it (or not this branch). |
| `CONTROLLED_MEDICINE` | 403 | — | Narcotics and equivalents can never be ordered in-app. Browsable, not buyable. |
| `INSUFFICIENT_STOCK` | 409 | `requested`, `available` | Not enough units. `available` is authoritative — use it to correct the UI. |

### Checkout

| Code | Status | Extra fields | What it means |
| --- | --- | --- | --- |
| `PRESCRIPTION_REQUIRED` | 400 | `medicineNames` | Cart has Rx items but no `prescriptionImageUrls`. Name the medicines in the prompt. |
| `OUTSIDE_DELIVERY_AREA` | 400 | — | The address falls outside every delivery zone for that branch. |
| `INVALID_COUPON` | 400 | — | Not valid, expired, used up, or below the minimum. The message says which. |

`CART_EMPTY` (400) and address/branch/payment-method lookup failures also occur
at checkout but carry no `code` — they are plain messages.

### Orders

| Code | Status | Extra fields | What it means |
| --- | --- | --- | --- |
| `ORDER_NOT_CANCELLABLE` | 409 | `status` | A customer may only cancel at `PENDING_CONFIRMATION`. Hide the button after that. |
| `ILLEGAL_ORDER_TRANSITION` | 409 | `from`, `to` | Staff-only. The state machine forbids that jump. |
| `PRESCRIPTION_NOT_APPROVED` | 409 | — | Staff-only. The order is frozen until a pharmacist signs off. |
| `ORDER_NO_LONGER_LIVE` | 409 | `status` | Staff-only. The order is already terminal, so its prescription can't be reviewed. |

### Payments

| Code | Status | What it means |
| --- | --- | --- |
| `UNSUPPORTED_PAYMENT_FLOW` | 400 | Wrong rail — e.g. asking for a gateway intent on a cash order. |
| `PAYMENT_ALREADY_SETTLED` | 409 | Already `PAID`. Stop polling and refresh the order. |
| `PAYMENT_NOT_PENDING` | 409 | The transaction is terminal and cannot be confirmed again. |
| `DUPLICATE_INSTAPAY_REFERENCE` | 409 | That transfer reference was already submitted. |

### Refunds (admin dashboard)

| Code | Status | What it means |
| --- | --- | --- |
| `ORDER_NOT_REFUNDABLE` | 409 | No payment record, or the payment never settled. |
| `REFUND_EXCEEDS_PAID_AMOUNT` | 400 | Amount exceeds what remains refundable. |
| `ILLEGAL_REFUND_TRANSITION` | 409 | `PENDING → APPROVED → COMPLETED`, or `→ REJECTED`. Both ends are terminal. |

---

## Status codes at a glance

| Status | Meaning | Client action |
| --- | --- | --- |
| 400 | Validation failure or a rejected domain precondition | Fix the request; show `messages` |
| 401 | Missing, expired or invalid access token | Refresh once, then retry; if refresh fails, log out |
| 403 | Authenticated but not allowed — wrong role, missing permission, or a forbidden item | Do not retry |
| 404 | Not found, or not visible to this caller | Treat as absent |
| 409 | Conflict with current state — stock, status, duplicates | Refresh state and re-present |
| 429 | Rate limited (**no body**) | Back off and retry |
| 500 | Server fault | Generic message; do not auto-retry mutations |

A note on **403 vs 404**: the API deliberately returns `404 Order not found` when
a customer requests someone else's order, rather than `403`. Do not read a 404 as
proof the record does not exist.

A note on **retries**: `GET` requests are safe to retry. `POST /v1/orders/checkout`
is **not** idempotent — retrying after a timeout can place a second order. If
checkout times out, poll `GET /v1/orders` and look for a matching recent order
before offering the user a retry.
