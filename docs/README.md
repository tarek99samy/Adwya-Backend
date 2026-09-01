# Adwya API documentation

Integration documentation for the Adwya backend — a marketplace for buying
medicine from nearby pharmacies in Egypt.

**Start here if you are building the mobile app:**
[**BACKEND_FOR_FLUTTER.md**](BACKEND_FOR_FLUTTER.md)

---

## Contents

| File | What it is | Maintained |
| --- | --- | --- |
| [BACKEND_FOR_FLUTTER.md](BACKEND_FOR_FLUTTER.md) | The main integration guide. Auth, conventions, the full customer journey with real request/response bodies, and the rules the client must implement. Written to be handed to an AI coding assistant. | by hand |
| [API_REFERENCE.md](API_REFERENCE.md) | Every route with its auth requirement, permission code and rate limit. | generated |
| [API_ERRORS.md](API_ERRORS.md) | The error envelope, its three shapes, and every machine-readable error code. | by hand |
| [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | Enums, the order state machine, prescription gating, stock and money rules, permissions. | by hand |
| [POSTMAN.md](POSTMAN.md) | How to use the collection. | by hand |
| [openapi.json](openapi.json) | OpenAPI 3 document, straight from the running server. Usable for client codegen. | generated |
| [adwya-api.postman_collection.json](adwya-api.postman_collection.json) | 67 requests, 17 folders, tokens captured automatically. | generated |
| [adwya-local.postman_environment.json](adwya-local.postman_environment.json) | Postman environment pointing at `localhost:3000`. | generated |

Operational documentation — deploying, probes, runbook — lives in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md), not here.

---

## Accuracy

Everything here was checked against a running server rather than read off the
source:

- Response bodies are copied from real responses.
- The public/protected split was probed live — all **66** product routes agreed
  with what the collection claims.
- `API_REFERENCE.md`, the OpenAPI document and the Postman collection are
  generated from the server itself, so they cannot drift from the routes.

**67 operations across 17 tags. 18 are public; the rest need a bearer token.**

---

## Regenerating

```bash
npm run start           # server must be running
npm run docs:spec       # refresh openapi.json from the live server
npm run docs:generate   # rebuild the Postman collection + API_REFERENCE.md
```

The hand-written files are not regenerated — update them when behaviour changes.

---

## Known gaps

Called out here because they affect what a client can build today:

- **No address endpoint.** Checkout requires an `addressId`, but nothing exposes
  address creation or listing. This blocks the checkout screen and needs a
  backend endpoint.
- **No image upload.** `prescriptionImageUrls` takes URLs of already-hosted
  images; there is no upload route. Blocks the prescription flow.
- **No push notifications.** Firebase is planned; the in-app inbox is all there
  is. Poll it.
- **Payment gateway is a stub.** `PAYMOB_CARD` and `PAYMOB_WALLET` are inactive
  and no money moves.
- **Money and coordinates are serialized inconsistently** — sometimes JSON
  numbers, sometimes JSON strings, for the same logical field. See
  [BACKEND_FOR_FLUTTER.md §4.2](BACKEND_FOR_FLUTTER.md#42-money-and-coordinates-are-sometimes-strings).
  Parse defensively.
