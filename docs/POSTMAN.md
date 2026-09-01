# Postman collection

Two files in this folder:

- **`adwya-api.postman_collection.json`** — 67 requests in 17 folders
- **`adwya-local.postman_environment.json`** — points `baseUrl` at `http://localhost:3000`

Both are generated from the running server's OpenAPI document, so they match the
API exactly rather than drifting from it.

---

## Import and first run

1. Postman → **Import** → drop both JSON files in.
2. Top-right environment picker → select **Adwya - Local**.
3. Start the backend (`npm run start:dev`) and confirm `GET {{baseUrl}}/readyz`
   returns `200`.
4. Open **Auth → `POST /v1/auth/signup`**, adjust the phone number, and send.

That last step is the important one: the signup, login and refresh requests each
carry a test script that writes `accessToken`, `refreshToken` and `userId` into
collection variables. The collection uses **bearer auth with `{{accessToken}}` at
the collection level**, so every other request picks the token up automatically.
You never paste a token by hand.

`POST /v1/orders/checkout` does the same for `orderId`.

---

## Variables

| Variable | Filled by | Notes |
| --- | --- | --- |
| `baseUrl` | environment | Server root. Product routes live under `/v1`. |
| `accessToken` | signup / login / refresh | Used by collection-level bearer auth |
| `refreshToken` | signup / login | Body of `/auth/refresh` and `/auth/logout` |
| `userId` | signup / login | |
| `orderId` | checkout | |
| `branchId` | you | From `GET /v1/pharmacies/branches` |
| `medicineId` | you | From `GET /v1/catalog/medicines` |
| `addressId` | you | See the caveat below |
| `paymentMethodId` | you | Seeded reference data |
| `pharmacyId`, `courierStaffId`, `batchId`, `notificationId`, `resetToken` | you | Dashboard and admin flows |

The 18 public routes are explicitly marked **No Auth** so they work before you
have a token — and so the collection documents which endpoints genuinely need
one. That public/protected split was verified against the live server: all 66
product routes agreed.

---

## Caveat: `addressId`

Checkout needs an `addressId`, but **there is no endpoint to create an address**
— it is a genuine gap in the API. Until one exists, insert one directly:

```bash
node -e "
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.address.create({ data: {
  userId: '<paste userId from the collection variable>',
  label: 'Home', street: 'Abbas El Akkad', area: 'Nasr City',
  city: 'Cairo', governorate: 'Cairo',
  latitude: 30.0605, longitude: 31.2299, isDefault: true,
}}).then(a => console.log(a.id)).finally(() => p.\$disconnect());
"
```

Paste the printed id into the `addressId` collection variable.

---

## A working sequence

```
Health      GET  /readyz                     confirm the server is up
Auth        POST /v1/auth/signup             captures tokens
Catalog     GET  /v1/catalog/medicines       copy an id -> medicineId
Pharmacies  GET  /v1/pharmacies/branches     copy an id -> branchId
Cart        POST /v1/cart/items              add the medicine
Cart        GET  /v1/cart                    check isCheckoutable
Orders      POST /v1/orders/checkout         captures orderId
Orders      GET  /v1/orders/{id}             full order detail
```

Anything past that — confirming, dispatching, delivering — needs a **pharmacy
staff token**, not the customer one you just captured. Log in as a staff user and
the collection variable is overwritten; log back in as the customer to continue
on the customer side. There is one token slot, so you are always acting as
whoever logged in last.

---

## Request descriptions

Every request carries a description with:

- what it does (from the server's own doc comments)
- whether it is public or needs a token
- the permission code, where one is required
- its rate limit, where it differs from the global 50/min
- a table of body fields with types and which are required

Bodies are pre-filled with realistic Egyptian sample data — phone numbers in
`01…` form, Cairo coordinates, EGP amounts. Required fields are ordered first so
you can delete the optional tail.

---

## Regenerating

The collection is generated, not maintained by hand. After changing any route:

```bash
npm run build && npm run start        # server must be running
npm run docs:spec                     # refresh docs/openapi.json from the server
npm run docs:generate                 # rebuild the collection + API_REFERENCE.md
```

The generators live in [`scripts/`](../scripts) — `gen-postman-collection.cjs`
and `gen-api-reference.cjs`. Two tables inside the collection generator are
hand-maintained because they are not expressible in the OpenAPI document: the
set of `@Public()` routes and the per-route rate limits. If you add a public
route or change a `@Throttle`, update those tables too.

As a fallback, Postman can import `docs/openapi.json` directly
(**Import → File**). You lose the token-capture scripts and the auth
annotations, but the routes and bodies will be correct.
