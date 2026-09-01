# Deployment and operations

Companion to `README.md`. Covers running the stack, deploying it, and the
things you need on hand when something breaks at 2am.

## Architecture

Two processes from one image, distinguished by `APP_ROLE`:

| Role | Command | What it does |
| --- | --- | --- |
| `api` | `node dist/main` | HTTP server. Runs migrations on boot. Produces queue jobs. |
| `worker` | `node dist/worker` | No HTTP server. Consumes queue jobs. Scale horizontally. |

Backing services: **PostgreSQL** (required) and **Redis** (optional — see
"Degraded operation" below).

**BullMQ is a library, not a service.** It runs inside the worker process and
uses Redis as its store. "Running BullMQ in Docker" means running the worker
container; there is no separate BullMQ image to deploy.

## Running locally

```bash
# infra only — API on the host, best for development
docker compose up -d postgres redis
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev          # API   :3000
npm run worker:dev         # worker (separate terminal)

# everything in containers, production-shaped
docker compose --profile app up -d
docker compose --profile app up -d --scale worker=3
```

`docker compose up -d` without a profile starts **infra only**. The `app`
profile adds the API and worker containers.

Compose Postgres is published on host **5433** so it never collides with a
native install on 5432.

## Environment

`.env.example` is the reference. The ones that matter:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes in practice | Optional at config level so the app can boot DB-less; Prisma fails at query time instead. |
| `JWT_ACCESS_SECRET` | **yes in production** | Signs access tokens. The app **refuses to boot** in production without it — the dev fallback is a literal in this repository, so running on it is the same as having no secret. |
| `JWT_REFRESH_SECRET` | no | Reserved. Refresh tokens are opaque random bytes stored hashed, not JWTs, so nothing signs with this today. |
| `PAYMENT_WEBHOOK_SECRET` | **yes in production** | Shared secret the gateway signs callbacks with. Also a boot-time requirement in production — anyone holding the dev fallback could forge a PAID callback. |
| `CORS_ORIGINS` | **yes in production** | Comma-separated. The app **refuses to boot** in production without it — a wildcard plus credentials would let any site drive the API with a logged-in user's token. |
| `REDIS_*` / `REDIS_URL` | no | Absent means degraded, not broken. |
| `ENABLE_DOCS` | no | Serves Swagger in production. Off by default — the schema maps the whole attack surface. |
| `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` | no | Both must be set for the seed to create an admin. |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deploying

The API container runs `prisma migrate deploy` on boot; workers do not
(`RUN_MIGRATIONS=false`), because N replicas racing the same advisory lock at
deploy time is a needless failure mode.

Rollout order that avoids a broken window:

1. Deploy the API first — it applies the migration.
2. Deploy workers once the API reports ready.
3. Workers get `stop_grace_period: 30s` and `dumb-init` forwards SIGTERM, so a
   rolling restart drains in-flight jobs instead of dropping them.

**Migrations must be backward-compatible with the previous release.** During a
rollout both versions run at once. Add columns nullable, backfill, then tighten
in a later release — never rename or drop in the same deploy that stops using
the old name.

Seeding is opt-in (`RUN_SEED=true`). It is idempotent, but it **replaces each
profile's permission grants**, so running it automatically on every boot means a
config drift silently reverts.

## Probes

| Path | Purpose |
| --- | --- |
| `GET /healthz` | Liveness. Touches nothing. A DB blip must not get the container killed. |
| `GET /readyz` | Readiness. 200 `ok` / 200 `degraded` / 503 `unavailable`. |
| `GET /metrics` | Prometheus. Keep it on the internal network only. |

All three are version-neutral (no `/v1` prefix) — an orchestrator should not
have to track API versions.

## Degraded operation

Redis down is **not** an outage:

- `/readyz` returns 200 with `status: "degraded"`, so the instance stays in the
  load balancer.
- Queue writes are swallowed; notifications are lost, orders are not.
- GPS ticks fail open and write straight to Postgres — slower, never dropped.

Postgres down **is** an outage: `/readyz` returns 503 and the instance should be
pulled from rotation.

## API versioning

Everything is served under `/v1`. A breaking change ships as `/v2` while `/v1`
keeps working, so installed mobile apps do not break on deploy. Probes and
`/metrics` are deliberately unversioned.

## Backup and restore

Nothing here is automated yet — wire these into your scheduler.

```bash
# Nightly logical backup
docker exec adwya-postgres pg_dump -U postgres -Fc adwya_dev > adwya-$(date +%F).dump

# Restore into a clean database
docker exec -i adwya-postgres pg_restore -U postgres -d adwya_dev --clean --if-exists < adwya-2026-08-31.dump
```

**Practise the restore before you need it.** A backup nobody has restored is a
hypothesis, not a backup.

Redis holds queued jobs and buffered GPS positions — both reconstructible, so it
does not need backing up. It does have `appendonly yes` so a container restart
does not drop queued work.

For production, add WAL archiving (point-in-time recovery); nightly dumps alone
mean up to 24h of data loss.

## Runbook

**API will not start** — check the log line. `CORS_ORIGINS must list...` means
production without an origin list. `Cannot find module dist/main` means the
build did not run or a stray `.ts` outside `src` moved the output; run
`rm -rf dist *.tsbuildinfo && npm run build`.

**Everything 403s for an admin** — the RBAC rows are missing. Run
`npm run prisma:seed`. The permission codes live in `prisma/seed.ts` and must
match the `@RequiredPermissions(...)` decorators; a code in a decorator but not
in the seed means that route 403s for everyone, forever.

**Notifications stop arriving** — check the worker is up
(`docker compose logs worker`) and Redis is reachable (`/readyz`). Jobs retry 3×
with exponential backoff; exhausted ones stay in the failed set for 24h.

**Orders succeed but stock looks wrong** — read `stock_movements` for the
medicine. Every change writes a row; the ledger and `branch_inventory` should
reconcile. A `branch_inventory_quantity_non_negative` violation means a write
path bypassed the guarded decrement.

**A payment settled twice** — it should not: `providerTransactionId` is unique
and a non-PENDING transaction is terminal. Check `payment_webhooks` for the raw
payloads; every callback is logged whether or not its signature verified.

## Not yet done

- Firebase push (the worker writes in-app notifications; `deliverPush` is a stub)
- Sentry / OpenTelemetry
- Automated backups and WAL archiving
- PgBouncer for connection pooling
- `npm run lint` (pre-existing syntax error in `eslint.config.mjs`)
