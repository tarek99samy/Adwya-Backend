# Adwya backend — integration guide for the Flutter app

This document is written to be handed to an AI coding assistant working on the
Adwya mobile app. It describes what the backend is, how to talk to it, and the
business rules the client has to respect. Everything here was verified against a
running instance — response shapes are copied from real responses, not invented.

Companion files in this folder:

| File | What it is |
| --- | --- |
| [`API_REFERENCE.md`](API_REFERENCE.md) | Every route, its auth requirement and rate limit. Generated from the server. |
| [`API_ERRORS.md`](API_ERRORS.md) | The error envelope and every machine-readable error code. |
| [`DOMAIN_MODEL.md`](DOMAIN_MODEL.md) | Enums, the order state machine, permissions, business rules. |
| [`POSTMAN.md`](POSTMAN.md) | How to use the Postman collection. |
| [`openapi.json`](openapi.json) | Machine-readable spec — usable for client codegen. |
| [`adwya-api.postman_collection.json`](adwya-api.postman_collection.json) | 67 requests, tokens captured automatically. |

---

## 1. What Adwya is

A marketplace for buying medicine from nearby pharmacies in Egypt.

A customer searches the medicine catalogue, picks a pharmacy branch (by choice
or by proximity), fills a cart, and checks out. A pharmacy has a dashboard for
registration, staff, stock and order fulfilment. Couriers deliver and stream
their position. Platform admins approve pharmacies, handle refunds and read the
audit log.

Three separate front-ends talk to this one API. The mobile app you are building
is the **customer** side; a few endpoints listed in the reference belong to the
pharmacy dashboard or admin console and are not yours to call.

**Currency is EGP. Distances are metres. Coordinates are WGS84 decimal degrees.**

---

## 2. Quick facts

| | |
| --- | --- |
| Base URL (local) | `http://localhost:3000` |
| Product routes | all under `/v1` — e.g. `POST /v1/auth/login` |
| Unversioned | `/healthz`, `/readyz`, `/metrics` only |
| Auth | `Authorization: Bearer <accessToken>` |
| Access token life | **15 minutes** (`expiresIn: 900`) |
| Refresh token life | **14 days**, rotates on every use |
| Content type | `application/json` |
| Default rate limit | 50 req/min per IP; some routes are tighter |
| Interactive docs | `http://localhost:3000/api/docs` (dev only) |

Set the base URL from a build-time constant. Never hardcode `localhost` into a
release build.

---

## 3. Authentication

### 3.1 The flow

```
POST /v1/auth/signup     -> { accessToken, refreshToken, expiresIn, user }
POST /v1/auth/login      -> { accessToken, refreshToken, expiresIn, user }
POST /v1/auth/refresh    -> { accessToken, refreshToken, expiresIn, user }
POST /v1/auth/logout     -> { message: "Logged out" }
```

Signup and login are interchangeable in shape. A real signup response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "0f0fffa262d7e4af69269bb93cda6105...",
  "expiresIn": 900,
  "user": {
    "id": "eaff2e30-2bbe-4d5a-9f59-4c5700dbd651",
    "phone": "01127182108",
    "email": null,
    "fullName": "Mostafa Kamel",
    "userType": "CUSTOMER",
    "isActive": true,
    "createdAt": "2026-09-01T03:26:10.585Z",
    "updatedAt": "2026-09-01T03:26:10.585Z"
  }
}
```

`accessToken` is a JWT. `refreshToken` is **not** a JWT — it is an opaque random
string stored hashed server-side. Do not try to decode it.

### 3.2 Refresh rotation — the rule that bites

Every call to `/v1/auth/refresh` **invalidates the refresh token you sent** and
returns a new one. Store the new one immediately.

Two consequences the client must handle:

1. **Never fire two refreshes concurrently.** If three requests 401 at once and
   each triggers a refresh, the first succeeds and the other two present an
   already-rotated token and fail — logging the user out. Serialise refresh
   behind a single-flight lock and have the other requests await it.
2. **Persist the new refresh token before retrying** the original request. If
   the app is killed between refreshing and saving, the user is logged out.

### 3.3 Recommended client behaviour

- Store both tokens in secure storage (`flutter_secure_storage`), not
  `SharedPreferences`.
- Refresh proactively at roughly 80% of `expiresIn` (≈12 minutes) rather than
  waiting for a 401. Keep the reactive 401 path as a fallback.
- On a 401 from `/v1/auth/refresh` itself, clear both tokens and send the user
  to login. That is unrecoverable.
- On logout, call `POST /v1/auth/logout` with the refresh token so the server
  revokes it, then clear local storage. Logout is `@Public()` — it authenticates
  by the refresh token in the body, not by a bearer header.

### 3.4 Password reset

Currently a two-step stub with no SMS provider wired:

```
POST /v1/auth/verify-user   { "phone": "01001234567" }   -> { token, ... }
POST /v1/auth/reset-password { "token": "...", "newPassword": "NewPassw0rd!" }
```

`verify-user` **returns the reset token in the response body** so the flow is
testable end-to-end without SMS. That is a development affordance — when SMS
lands the token will be delivered out of band and will disappear from the
response. Do not build UI that depends on reading it from the response.

Resetting a password revokes every outstanding refresh token for that user.

---

## 4. Response conventions

### 4.1 Lists are always enveloped

```json
{
  "data": [ ... ],
  "meta": { "total": 1, "page": 1, "limit": 2 }
}
```

`page` is 1-based. Pass `?page=` and `?limit=`. Some list endpoints add extra
`meta` keys — branch reviews add `averageRating` and `reviewCount`,
notifications add `unread`.

Two endpoints return a **bare array**, not an envelope: `GET /v1/pharmacies/branches`
and `GET /v1/inventory/branches/:branchId/movements/:medicineId`. Check the
reference before assuming.

### 4.2 Money and coordinates are sometimes strings

⚠️ **This is the single most important detail in this document.**

The database stores money as `DECIMAL(10,2)` and coordinates as `DECIMAL`.
Where a response is serialized straight from the database, those fields arrive
as **JSON strings**. Where a service maps them by hand, they arrive as
**numbers**. The API is not consistent about this today.

Verified against a live server:

| Endpoint | Field | Type |
| --- | --- | --- |
| `GET /v1/cart` | `subtotal`, `items[].unitPrice`, `items[].lineTotal` | **number** |
| `POST /v1/orders/checkout` | `subtotal`, `deliveryFee`, `discountTotal`, `total` | **string** |
| `POST /v1/orders/checkout` | `items[].unitPriceSnapshot`, `items[].subtotal` | **string** |
| `POST /v1/orders/checkout` | `payment.amount` | **string** |
| `GET /v1/orders/:id` | same as checkout — all **string** |
| `GET /v1/payments/orders/:orderId` | `amount` | **number** |
| `GET /v1/pharmacies/branches` | `latitude`, `longitude`, `ratingAvg` | **string** |
| `GET /v1/pharmacies/branches/:id/reviews` | `meta.averageRating` | **number** |

Note that `payment.amount` is a **string** when nested inside an order and a
**number** from the payments endpoint. Same value, same name, different type.

Live delivery tracking is worse: `currentLatitude` / `currentLongitude` come
back as **numbers** when the position is being served from the live Redis
buffer, and as **strings** when it falls back to the stored database row. The
type depends on how recently the courier pinged.

**Do not model these as `double` or `num` and let `jsonDecode` cast.** It will
throw in production the first time it meets the other form. Parse every money
and coordinate field through a tolerant helper:

```dart
/// Money and coordinates arrive as either a JSON number or a JSON string
/// depending on the endpoint. Always route them through this.
double asNum(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}
```

For money specifically, prefer parsing to a minor-unit `int` (piastres) or a
`Decimal` and never doing float arithmetic on totals you display.

This inconsistency is a known backend defect. If it is fixed, everything moves
to **number** — the helper above keeps working either way, which is why it is
the right thing to write now.

### 4.3 Dates

Always ISO-8601 UTC with `Z`: `"2026-09-01T03:26:10.585Z"`. Parse with
`DateTime.parse(...).toLocal()` for display.

### 4.4 Unknown fields are rejected

The server runs a strict validation pipe. Sending a field that is not in the DTO
is a **400**, not a silent drop:

```json
{ "message": ["property bogus should not exist"] }
```

So do not send back an object you received. Build request bodies explicitly with
only the documented fields.

---

## 5. Errors

Every error uses one envelope:

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

The useful part is nested under `error`. Note the shape of `error` varies:

- **Domain errors** carry `{ message: String, code: String }` plus extra context
  fields. Branch on `error.code` — it is stable; the message text is not.
- **Validation errors (400)** carry `{ message: String[], error, statusCode }`.
  `message` is an **array of strings** here and a plain string elsewhere.
- **429** returns no body at all.

```dart
// error.message is a String for domain errors and a List<String> for validation
// failures. Normalise before showing anything to the user.
List<String> messagesOf(Map<String, dynamic> body) {
  final e = body['error'];
  if (e is! Map) return ['Something went wrong'];
  final m = e['message'];
  if (m is List) return m.map((x) => x.toString()).toList();
  return [m?.toString() ?? 'Something went wrong'];
}
```

The full code list is in [`API_ERRORS.md`](API_ERRORS.md). The ones your UI must
handle explicitly are `CART_BRANCH_MISMATCH`, `PRESCRIPTION_REQUIRED`,
`INSUFFICIENT_STOCK`, `CONTROLLED_MEDICINE`, `OUTSIDE_DELIVERY_AREA`,
`INVALID_COUPON` and `ORDER_NOT_CANCELLABLE`.

---

## 6. Rate limits

Per IP, per minute. Exceeding a limit returns **429** with an empty body.

| Routes | Limit |
| --- | --- |
| Everything by default | 50/min |
| All `/v1/auth/*` | 20/min |
| `/v1/cart/*` | 60/min |
| `POST /v1/orders/checkout` | **10/min** |
| `POST /v1/payments/intent` | 10/min |
| `POST /v1/orders/:id/delivery/location` | 30/min |
| `POST /v1/pharmacies/register` | 5/min |

Two practical consequences:

- **Debounce catalogue search.** Typing "panadol" one character at a time is 7
  requests. Debounce ~300 ms and cancel in-flight requests.
- **Guard the checkout button.** Disable it on first tap until the response
  arrives. 10/min is deliberately tight because checkout moves stock and money.

Note that emulators and CI often share an IP — if limits fire during
development, that is usually why.

---

## 7. The customer journey

This is the path your app implements, end to end.

### Step 1 — Find medicines

```
GET /v1/catalog/medicines?search=panadol&page=1&limit=20
```
Public, no token. Filters: `search` (matches name, generic name, barcode),
`categoryId`, `brandId`, `manufacturerId`, `requiresPrescription`.

```json
{
  "data": [{
    "id": "33333333-3333-4333-8333-333333333331",
    "name": "Panadol Extra",
    "nameAr": null,
    "genericName": "Paracetamol",
    "strength": null,
    "barcode": null,
    "requiresPrescription": false,
    "isControlled": false,
    "brand": null, "category": null, "manufacturer": null
  }],
  "meta": { "total": 1, "page": 1, "limit": 2 }
}
```

The catalogue is **global** — it does not tell you price or stock. Price and
availability are per branch and only appear once the medicine is in a cart, or
via the pharmacy dashboard's inventory endpoints. Show "from X pharmacies" style
UI rather than a price on the catalogue screen.

### Step 2 — Find branches

```
GET /v1/pharmacies/branches?nearLatitude=30.06&nearLongitude=31.22&radiusMeters=5000
```
Public. Returns a **bare array**. Only `APPROVED`, non-deleted branches are ever
returned — the server forces that regardless of query parameters.

`latitude`, `longitude` and `ratingAvg` are strings here (see §4.2).

### Step 3 — Build a cart

```
POST /v1/cart/items      { "medicineId": "...", "quantity": 2 }
GET  /v1/cart
PATCH /v1/cart/items/:id { "quantity": 3 }
DELETE /v1/cart/items/:id
DELETE /v1/cart
```

`quantity` must be between **1 and 100** — outside that is a 400 from
validation, before any stock check.

The cart is created lazily; `GET /v1/cart` never 404s. Response:

```json
{
  "id": "a773ff78-...", "userId": "eaff2e30-...",
  "branchId": "22222222-2222-4222-8222-222222222222",
  "items": [{
    "id": "e2ff00a3-...",
    "medicineId": "33333333-...",
    "name": "Panadol Extra",
    "quantity": 2,
    "unitPrice": 25,
    "lineTotal": 50,
    "requiresPrescription": false,
    "quantityAvailable": 45,
    "inStock": true
  }],
  "subtotal": 50,
  "isCheckoutable": true
}
```

Use `isCheckoutable` to enable the checkout button, and per-item `inStock` to
flag lines that went out of stock since they were added.

**The cart belongs to exactly one branch.** Adding an item stocked only by a
different branch fails with `409 CART_BRANCH_MISMATCH`:

```json
{
  "message": "Your cart already contains items from another pharmacy...",
  "code": "CART_BRANCH_MISMATCH",
  "currentBranchId": "...",
  "incomingBranchId": "..."
}
```

The correct UX is a confirmation dialog — *"Your cart has items from another
pharmacy. Clear it and start here?"* — and on confirm:

```
POST /v1/cart/switch-branch  { "medicineId": "...", "quantity": 1 }
```

which clears the cart and re-scopes it in one call. Never silently discard the
cart.

The first add sets the branch; removing the last item releases it.

### Step 4 — Checkout

```
POST /v1/orders/checkout
{
  "branchId": "...",
  "addressId": "...",
  "paymentMethodId": "...",
  "couponCode": "SAVE10",                                  // optional
  "prescriptionImageUrls": ["https://cdn.example/rx1.jpg"],// required if any Rx line
  "deliveryNote": "Third floor",                           // optional
  "deliveryLatitude": 30.0605,                             // optional, defaults to the address
  "deliveryLongitude": 31.2299
}
```

`branchId` must equal the cart's branch or you get `400`. **The client never
sends prices.** Every price is recomputed server-side from live branch inventory
and snapshotted onto the order, so the total you see in the cart can legitimately
differ from the order total if a price changed. Show the server's total.

Response `201` (abbreviated — see §4.2 about the string types):

```json
{
  "id": "fd209b91-...",
  "orderNumber": "ADW-MTI3UXJCKTU",
  "status": "PENDING_CONFIRMATION",
  "paymentStatus": "PENDING",
  "prescriptionStatus": "PENDING_REVIEW",
  "subtotal": "140", "deliveryFee": "20",
  "discountTotal": "14", "total": "146",
  "deliveryAddressText": "14, Abbas El Akkad, Nasr City, Cairo, Cairo (Third floor)",
  "items": [{ "medicineNameSnapshot": "Panadol Extra", "unitPriceSnapshot": "25", "quantity": 2, "subtotal": "50" }],
  "payment": { "amount": "146", "status": "PENDING" }
}
```

`orderNumber` is the human-quotable reference — show that, not the UUID.

A successful checkout empties the cart. The failures you must handle:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `PRESCRIPTION_REQUIRED` | Cart has Rx items but no `prescriptionImageUrls`. Body lists `medicineNames`. |
| 409 | `INSUFFICIENT_STOCK` | Someone bought it first. Body carries `requested` and `available`. |
| 403 | `CONTROLLED_MEDICINE` | A controlled item slipped into the cart. |
| 400 | `OUTSIDE_DELIVERY_AREA` | The address is outside every delivery zone for that branch. |
| 400 | `INVALID_COUPON` | Expired, used up, or below the minimum order. Message says which. |

There is a genuine race on stock: the cart says `inStock: true`, then checkout
409s because another customer took the last unit. This is expected — the server
guards stock atomically. Handle it gracefully rather than treating it as a bug.

### Step 5 — Track the order

```
GET /v1/orders?page=1&limit=20     // the caller's own orders
GET /v1/orders/:id                 // full detail incl. statusHistory
POST /v1/orders/:id/cancel { "cancelReason": "Ordered by mistake" }
```

`GET /v1/orders/:id` includes `items`, `payment`, `prescriptions`,
`statusHistory` (ascending) and `deliveryRun`, so one call drives the whole
order-detail screen.

**A customer may only cancel while the order is `PENDING_CONFIRMATION`.** After
the pharmacy confirms, cancelling returns `409 ORDER_NOT_CANCELLABLE` and the
user must phone the pharmacy. Hide the cancel button once `status` moves past
`PENDING_CONFIRMATION` rather than showing it and failing.

The full status flow is in [DOMAIN_MODEL.md](DOMAIN_MODEL.md#order-state-machine).
Only staff can advance a status; the customer app only ever reads it, plus the
one cancel above.

### Step 6 — Live delivery tracking

```
GET /v1/orders/:id/delivery
```

Returns `404` until a courier is assigned — treat that as "not dispatched yet",
not an error. Once assigned:

```
orderId, orderStatus, assignedAt, pickedUpAt, deliveredAt,
courierName, courierPhone,
currentLatitude, currentLongitude, positionAt, live
```

`live: true` means the position came from the real-time buffer; `false` means it
is the last value written to the database and may be up to 30 seconds stale.
Remember the numeric type flips between those two cases (§4.2).

There are no websockets. **Poll** while the order is `OUT_FOR_DELIVERY` — every
10–15 seconds is reasonable — and stop polling as soon as the status is terminal
or the screen is disposed.

### Step 7 — Review

```
POST /v1/orders/:orderId/review  { "rating": 5, "comment": "Fast delivery" }
```

`rating` is 1–5. Only the customer who placed it, only once, and **only after
the order is `DELIVERED`** — otherwise `409`. A second attempt is also `409`.
Show the review prompt only on delivered orders without an existing review.

Public branch reviews: `GET /v1/pharmacies/branches/:branchId/reviews`, whose
`meta` carries `averageRating` and `reviewCount`.

---

## 8. Payments

Three rails, and the client behaves differently for each. Read
`paymentMethod.code`, not its name or id.

| Code | Flow |
| --- | --- |
| `CASH` | Nothing to do. Settles to `PAID` automatically when the order is delivered. |
| `VISA_ON_DELIVERY` | Same as cash — the courier carries the card machine. |
| `INSTAPAY` | Customer transfers manually, then reports the reference. Staff confirm it. |
| `PAYMOB_CARD` / `PAYMOB_WALLET` | Gateway redirect. **Currently inactive** — a stub provider, no real payments. |

**InstaPay:**
```
POST /v1/payments/orders/:orderId/instapay  { "reference": "IPN-8837261", "note": "..." }
```
This does **not** settle the payment. It records the reference as pending for
branch staff to check against their bank statement. Show the order as "awaiting
payment confirmation". A duplicate reference returns
`409 DUPLICATE_INSTAPAY_REFERENCE`.

**Gateway:**
```
POST /v1/payments/intent  { "orderId": "..." }
-> { redirectUrl, providerTransactionId, expiresAt, amount, ... }
```
Open `redirectUrl` in a web view, then poll `GET /v1/payments/orders/:orderId`
for `status` to become `PAID`. Settlement arrives via a server-side webhook, so
the redirect returning does **not** mean the payment succeeded — always confirm
with the server. Calling this for `CASH`, `VISA_ON_DELIVERY` or `INSTAPAY`
returns `400 UNSUPPORTED_PAYMENT_FLOW`.

**The gateway is a stub.** `StubPaymentProvider` mints fake intents and no money
moves. Build the flow, but do not test against a real card.

---

## 9. Notifications

```
GET   /v1/notifications?page=1&limit=20&isRead=false
PATCH /v1/notifications/read      { "notificationIds": ["..."] }
PATCH /v1/notifications/read-all
```

`meta.unread` gives the badge count. Each notification carries `title`, `body`,
`type`, `isRead` and `createdAt`; `title` and `body` are already rendered
server-side from a template, so display them as-is.

`type` is a free-form string column, not an enum. **Today the server only ever
writes `"ORDER_UPDATE"`** — filtering by any other value returns nothing. Treat
it as an open set: switch on it with a default branch rather than an exhaustive
`enum`, because new values can appear without an API version change.

Of the eight seeded templates, only five are actually sent today
(`ORDER_PLACED`, `ORDER_CONFIRMED`, `ORDER_OUT_FOR_DELIVERY`, `ORDER_DELIVERED`,
`ORDER_CANCELLED`). `PRESCRIPTION_APPROVED`, `PRESCRIPTION_REJECTED` and
`PAYMENT_RECEIVED` exist in the database but nothing enqueues them yet — so the
app will not be told when a pharmacist approves a prescription. Poll the order
instead.

**Push notifications do not exist yet.** Firebase is planned but unimplemented —
`deliverPush` is a documented stub. Everything is in-app only, so poll this
endpoint (e.g. on resume and on the orders screen). Do not build against an FCM
token registration endpoint; there isn't one.

Notification delivery is also best-effort: if the backend's queue is
unavailable, a notification is dropped rather than blocking the order. Never
treat "no notification" as "nothing happened" — the order is the source of
truth.

---

## 10. What is not built yet

Do not design around these:

- **Push notifications (Firebase).** In-app inbox only.
- **Real payment gateway.** Stub provider; `PAYMOB_*` methods are inactive.
- **Image upload.** `prescriptionImageUrls` takes URLs of already-hosted images.
  There is no upload endpoint — you need object storage (S3/Cloudinary) or a new
  backend endpoint. Raise this early; it blocks the prescription flow.
- **Real-time sockets.** Poll for tracking and notifications.
- **Address CRUD.** `addressId` is required at checkout, but there is no public
  endpoint to create or list addresses. This is a gap — flag it to the backend
  developer before building the address screen.
- **SMS/email.** Password reset returns the token in the response.

---

## 11. Running the backend locally

```bash
npm install
docker compose up -d postgres redis    # or a native Postgres on 5432
npx prisma migrate deploy
npm run prisma:seed                    # permissions, payment methods, templates
npm run start:dev                      # API on :3000
npm run worker:dev                     # notification worker, separate terminal
```

Redis is optional — without it the API still serves; notifications are dropped
and delivery positions write straight to the database. `GET /readyz` reports
`ok`, `degraded` or `unavailable`.

Swagger UI is at `http://localhost:3000/api/docs` in development.

---

## 12. Checklist for the app

- [ ] Single-flight refresh lock; never two refreshes at once
- [ ] Tokens in secure storage; proactive refresh at ~12 minutes
- [ ] Every money/coordinate field through a string-or-number parser
- [ ] `error.code` drives UI branching, never the message text
- [ ] `error.message` handled as both `String` and `List<String>`
- [ ] Debounced catalogue search; checkout button disabled while in flight
- [ ] `CART_BRANCH_MISMATCH` → confirm dialog → `POST /v1/cart/switch-branch`
- [ ] Cancel button hidden once past `PENDING_CONFIRMATION`
- [ ] Delivery polling starts on `OUT_FOR_DELIVERY` and stops on dispose
- [ ] Review prompt only on `DELIVERED` orders without a review
- [ ] 429 handled with a backoff, not an error dialog
