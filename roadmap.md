Backend Roadmap to Production

I'm thinking of this in 5 phases, each producing a deployable backend but with progressively more depth. Phase 0 is where we are now (foundations). The pill-shaped core is Phase 1–2 (auth + commerce); everything after that is one slice of risk at a time.

Phase 0 — Foundations ✅ DONE

schema.prisma, Prisma client, AppConfig, PrismaService, global ValidationPipe, /healthz, ~50 DTOs, audit-log + exception-filter + custom validators, and the initial migration applied to local Postgres. We just finished this.

Phase 1 — Auth + Identity (the gate everything else sits behind)

Nothing else is usable without this. Most other modules are permission-gated.

1.1 Auth wiring — uncomment src/auth/auth.module.ts, wire into app.module.ts. Implement AuthService for the four flows the DTOs already describe:

- POST /auth/login (password login, email-or-phone)
- POST /auth/signup (customer registration with verification question)
- POST /auth/verify (verify user exists, send reset question)
- POST /auth/verify-question + POST /auth/reset-password (forgot-password flow)

1.2 @nestjs/jwt + @nestjs/passport — issue access + refresh tokens. JWT secret comes from AppConfig.JWT_SECRET (already declared). Refresh tokens: store a hash in User.passwordHash? No — add a RefreshToken model (or reuse DeviceToken with a purpose field). I'd prefer a separate RefreshToken table for clarity.

1.3 JwtAuthGuard + @CurrentUser() decorator — replaces the commented auth.guard.ts. Apply globally with @Public() opt-out for /auth/*, /healthz, Swagger.

1.4 RBAC guard — PermissionGuard that reads auth.user.profiles → profilePermissions → permissions and matches against a @RequiredPermissions('orders.create') decorator. Decision point: does a user-level deny (in UserPermission.granted = false) beat a profile-level grant? The domain-notes.md flags this as an open question. I'd lock it down now: deny-wins (most secure default; if you disagree, you're one line away from grant-wins).

1.5 Customer-vs-staff login split — the schema has User.userType. The auth response should include userType, and the JWT payload should too. Add a thin UserTypeGuard that's a coarser version of RBAC for "this whole route is staff-only" / "this whole route is customer-only".

1.6 Tests — auth.e2e-spec.ts covers happy paths + every flow in the DTOs. auth.service.spec.ts mocks Prisma. Goal: green CI on Phase 1 before moving on.

Phase 1 delivers: a login screen on the frontend can talk to a backend that returns a JWT, and every subsequent endpoint can require @JwtAuthGuard().

Phase 2 — The commerce core (cart + checkout + orders)

This is the highest-risk module per domain-notes.md. Get it right and the rest is administrative.

2.1 Catalog read endpoints — GET /medicines (search, filter by category/brand/requiresPrescription, paginate), GET /medicines/:id, GET /categories, GET /brands. Read-only, no auth needed. Also a GET /medicines/search?q= backed by a pg_trgm GIN index — added in the raw-SQL migration next session (already on the README's roadmap).

2.2 Pharmacies read endpoints — GET /pharmacies/branches with nearLat/Lng/radius filter (haversine in the service until PostGIS lands), GET /pharmacies/branches/:id. Read-only.

2.3 Cart service — GET /cart, POST /cart/items, PATCH /cart/items/:id, DELETE /cart/items/:id. Enforce single-branch-per-cart (clearest rule: if you add an item from a different branch, replace the branch + clear other items, or 409 — pick one and document it).

2.4 Checkout — the highest-stakes endpoint — POST /orders/checkout. Per domain-notes.md §1: branch-scope check, availability check, controlled-medicine rejection, prescription gating, all inside one $transaction:

- Conditional decrement of BranchInventory (UPDATE ... WHERE quantity_available >= :qty)
- Write StockMovement per line
- Create Order + OrderItem (snapshot name + price)
- Create Payment (status PENDING)
- Apply Coupon (validity check + CouponUsage insert in same transaction)
- Create OrderStatusHistory (initial row)
- Outside the transaction: enqueue notification job

2.5 Order state machine — POST /orders/:id/transition with an allowed-transitions map. Enforce in the service: PENDING_CONFIRMATION → CONFIRMED|REJECTED, etc. Every transition writes OrderStatusHistory.

2.6 Prescription review — PATCH /prescriptions/:id for pharmacist approval/rejection. On reject: reverse stock.

2.7 Delivery assignment + courier GPS — POST /orders/:id/delivery creates DeliveryRun. For GPS pings, buffer in Redis, flush every N seconds. Don't write to Postgres on every tick. This is the first Redis dependency — add RedisModule + ioredis to the project. BullMQ for the notification queue.

2.8 Tests — orders.e2e-spec.ts covering the happy path plus the four failure paths: out-of-stock at checkout, mixed-branch cart, controlled-medicine rejection, prescription-gated order can't transition past PENDING_CONFIRMATION. These are the tests that catch the bugs that hurt.

Phase 2 delivers: the mobile app can browse → cart → checkout → see order status update.

Phase 3 — Payments + Refunds + Pharmacy onboarding

3.1 Webhook receiver — POST /payments/webhooks/paymob (and instapay later). Signature verification, idempotency via providerTransactionId unique on PaymentTransaction, raw payload logged to PaymentWebhook regardless. The signatureValid field on PaymentWebhook is the audit truth.

3.2 Payment intent flow — POST /payments/intent returns the gateway redirect for INSTAPAY + PAYMOB_CARD. CASH and VISA_ON_DELIVERY skip intent — they're confirmed at delivery.

3.3 Refunds — POST /refunds (admin only). References PaymentTransaction, not just Order. Reconciles with the provider.

3.4 Pharmacy onboarding endpoints — POST /pharmacies (creates a Pharmacy + the onboarding user), POST /pharmacies/:id/branches (license upload, PENDING_APPROVAL), POST /admin/pharmacies/:id/approve (admin role). The pharmacy-side dashboard consumes these.

3.5 Pharmacy catalog management — POST /branches/:id/inventory (set price + qty for a medicine), POST /branches/:id/inventory/batches (receive a batch, update Batch + BranchInventory in a transaction). The "warehouse receives → transfer to branch" flow with a StockMovement of WAREHOUSE_RECEIPT then TRANSFER_TO_BRANCH.

3.6 Tests — webhook idempotency test (send the same webhook twice, confirm one effect). Stock decrement race test (concurrent checkouts, one should fail).

Phase 3 delivers: real money can flow, pharmacies can self-onboard and manage their catalog.

Phase 4 — Cross-cutting production-readiness

4.1 Notifications — WhatsApp + push. NotificationService reads NotificationTemplate, fills variables, sends. Queue via BullMQ. Templates are admin-editable (CRUD on NotificationTemplate).

4.2 Reviews — POST /orders/:id/review. One review per order (@unique already in schema). RBAC-gated to the order's customer.

4.3 Admin endpoints — all the CRUD on Brand, Category, Manufacturer, Medicine, PaymentMethod, Coupon, Campaign, Promotion. Permission-gated.

4.4 Audit log — AuditLogInterceptor wraps every mutating service method, writes before/after JSON. Easy to retrofit by attaching a small decorator + interceptor.

4.5 Rate limiting — @nestjs/throttler is already wired. Add per-route limits: 5/min on /auth/login, 30/min on /orders/checkout, etc.

4.6 Swagger — uncomment @ApiProperty decorators (or use nestjs-swagger's CLI to generate them from the DTOs). Serve at /api/docs. This is the single biggest DX improvement for the frontend team.

4.7 Error contract — single GlobalHttpExceptionFilter returns { statusCode, error, message, path, timestamp } (already exists per the inventory). Verify all custom exceptions in src/common/exceptions/* go through it.

4.8 Logging — structured JSON logs (pino). Request IDs via cls-hooked. One log line per request with { method, path, status, durationMs, userId, requestId }. The frontend can pass X-Request-Id for correlation.

4.9 Health checks — /healthz (already exists) for liveness, /readyz for readiness (DB + Redis reachable). Kubernetes-friendly.

Phase 4 delivers: the backend is operationally usable — logged, rate-limited, documented, observable.

Phase 5 — Production deployment

5.1 Dockerfile + docker-compose — multi-stage build (node:24-alpine), non-root user, prisma migrate deploy in the entrypoint. docker-compose.yml with postgres, redis, api. The README already documents the DB setup; the Dockerfile is the missing piece.

5.2 CI/CD — GitHub Actions (or whatever you use): lint + typecheck + unit tests on PR, build + e2e tests on merge to main, deploy on tag. Manual deploy as a fallback.

5.3 Environment management — .env.example (no secrets) at the repo root, real .env in the deploy target (or in a secret manager). Three environments: dev, staging, production. Identical schema, different seed data.

5.4 Horizontal scaling — single Node process behind a load balancer. Stateless API; sessions in Redis (if any). Postgres connection pooling (PgBouncer for prod). Background workers (BullMQ) as separate processes.

5.5 Observability — Prometheus metrics endpoint (/metrics), OpenTelemetry traces, Sentry for errors. Alerts on error rate, p99 latency, queue depth.

5.6 Backup & DR — automated Postgres backups (daily + WAL archiving), restore drill, runbook in the repo.

5.7 Security review — penetration test, secrets audit (no .env in git history), dependency audit (npm audit + Renovate). JWT secret rotation, CORS lockdown (the origin: '*' in main.ts is dev-only).

5.8 Mobile-app cutover — once the API is deployed and the frontend team has the Swagger doc, the mobile app and the customer web frontend can be wired up. The backend should be versioned (/v1/*) so future breaking changes don't break installed apps.

Phase 5 delivers: a system that runs in production, recovers from failures, and ships new features without downtime.

---

Sequencing principle

I deliberately put auth (Phase 1) before commerce (Phase 2) — but the catalog read endpoints (Phase 2.1, 2.2) can be shipped to a staging environment in parallel with Phase 1, because they're read-only and don't need auth. That gives the frontend team something to look at on day 1.

The raw-SQL migration (the pg_trgm GIN index, the reviews.rating CHECK, the batches location-type CHECK) is the first thing I'd do after this session ends — it's 30 minutes of work and unblocks fuzzy medicine search (a UX requirement, not a nice-to-have).

What I'd cut from a 6-month plan

If time gets tight, the easiest cuts are:

- Admin CRUD (Phase 4.3) — keep using SQL/Prisma Studio for the first 3 months, build proper admin UIs once the product-market fit is clearer.
- Campaigns + Promotions (the more complex promotion rules) — coupons alone cover 80% of marketing needs.
- Push notifications — WhatsApp alone is enough for the Egyptian market until DAUs justify FCM.

The hard cuts (don't do these even if pushed):

- Auth — every endpoint in the system needs it.
- The checkout transaction — this is the system. Cutting it means cutting the product.
- Webhook idempotency — once you have chargebacks, you'll wish you had it.

What I'd add that's not in the schema

A few things that will come up but aren't yet:

- An Idempotency-Key header on POST /orders/checkout and POST /payments/intent — let the client retry safely without creating duplicate orders. Stored in Redis for 24h.
- A notifications_outbox table — write inside the checkout transaction, then a worker drains it. Otherwise: notification-on-DB-failure is a real bug.
- A currency column on Order — for now everything is EGP, but you'll need it the day you decide to expand to a second country.
- Structured request validation errors — class-validator errors flattened into { field, message }[] in the response. The frontend team will ask for this on day 1.

---

TL;DR

We're at end of Phase 0. Realistic timeline from here:

┌───────────────────────────┬──────────┬─────────────────────────────────────────┐
│ Phase │ Duration │ What's working after │
├───────────────────────────┼──────────┼─────────────────────────────────────────┤
│ 1 — Auth │ 2 weeks │ Login + JWT + RBAC │
├───────────────────────────┼──────────┼─────────────────────────────────────────┤
│ 2 — Commerce │ 4 weeks │ Browse → cart → checkout → order status │
├───────────────────────────┼──────────┼─────────────────────────────────────────┤
│ 3 — Payments + Pharmacies │ 3 weeks │ Real money + pharmacy onboarding │
├───────────────────────────┼──────────┼─────────────────────────────────────────┤
│ 4 — Production-readiness │ 2 weeks │ Swagger, logs, rate limits, health │
├───────────────────────────┼──────────┼─────────────────────────────────────────┤
│ 5 — Deploy │ 1 week │ Live in production │
└───────────────────────────┴──────────┴─────────────────────────────────────────┘

~3 months to a deployable backend that serves both the customer mobile app and the pharmacy dashboard. The heavy lifting is Phases 1–2; the rest is iteration. The single biggest risk is the checkout transaction — invest the test coverage there, and the rest of the system gets easier.
