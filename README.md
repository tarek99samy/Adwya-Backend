# Adwya-Backend

NestJS 11 + Prisma 6 + PostgreSQL service for **Adwya** — an Egypt-targeted pharmacy-delivery marketplace. Customers browse medicines, pick a pharmacy, add to cart, and check out. Pharmacies self-onboard via a dashboard and manage their own catalog. Admins run a separate dashboard.

See [`domain-notes.md`](./domain-notes.md) for the business rules and workflows the schema can't express (checkout transaction, prescription gating, payment idempotency, etc.).

## Stack

- **NestJS 11** (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`)
- **Prisma 6** + PostgreSQL 15+
- **TypeScript 5.7** (ES2023, NodeNext, `strictNullChecks` on)
- **class-validator** + **class-transformer** for DTO validation
- **Jest 30** for unit and e2e tests
- **ESLint 9** (flat config, type-checked) + **Prettier 3**

## Common commands

```bash
# install
npm install

# generate Prisma client (run after any schema.prisma change)
npm run prisma:generate

# dev (watch mode)
npm run start:dev

# production build + run
npm run build && npm run start:prod

# lint (auto-fix) and format
npm run lint
npm run format

# tests
npm run test          # unit tests (src/**/*.spec.ts)
npm run test:e2e      # e2e tests (test/**/*.e2e-spec.ts)
npm run test:cov      # unit tests + coverage to ../coverage
```

## Project layout

```
src/
  main.ts                # bootstrap, global ValidationPipe, /healthz
  app.module.ts          # root @Module — wires ConfigModule + PrismaModule + feature modules
  config/
    app.config.ts        # AppConfig class + validateEnv (env-var schema, validated at boot)
  prisma/
    prisma.module.ts     # @Global() module exporting PrismaService
    prisma.service.ts    # extends PrismaClient, OnModuleInit/OnModuleDestroy for connect/disconnect
  common/
    enums/               # re-exports Prisma enums so DTOs import from one place
    validators/          # custom class-validator decorators (IsEgyptianPhone, etc.)
  <feature>/
    dto/                 # create- / update- / filter- / response- DTOs
    <feature>.module.ts
    <feature>.controller.ts
    <feature>.service.ts
test/
  *.e2e-spec.ts          # e2e tests
schema.prisma            # Prisma schema (source of truth for the data model)
schema.prisma.original   # pre-PostGIS-removal snapshot, kept for reference
domain-notes.md          # business rules & workflows (companion to schema.prisma)
```

## Environment variables

All env vars are validated at boot by `src/config/app.config.ts`. Boot fails fast on a missing required value or a malformed value.

| Var | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | One of `development`/`test`/`production` |
| `PORT` | no | `3000` | HTTP listen port |
| `DATABASE_URL` | **yes** | — | Prisma Postgres connection string, e.g. `postgresql://user:pass@localhost:5432/adwya?schema=public` |
| `JWT_SECRET` | no (required once auth lands) | — | Symmetric secret for `@nestjs/jwt` |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime, passed to `JwtModule.signOptions` |
| `APP_PUBLIC_URL` | no | — | Public base URL used for absolute deep links (e.g. WhatsApp messages) |

`.env*` is gitignored. Place a `.env` at the repo root for local dev.

## Database setup

### 1. Local Postgres requirements

- Postgres 15+ (any 13+ works, but 15 is what we test against)
- The `pg_trgm` extension must be available (used for fuzzy medicine search; added in the migration below)
- A database you can connect to with the `DATABASE_URL` role

```bash
# install (Ubuntu/Debian)
sudo apt install postgresql postgresql-contrib
# the postgresql-contrib package ships pg_trgm

# macOS (Homebrew)
brew install postgresql@15
brew services start postgresql@15
```

```bash
# create the role + database (one-time)
sudo -u postgres psql <<'SQL'
CREATE USER adwya WITH PASSWORD 'adwya_dev';
CREATE DATABASE adwya OWNER adwya;
\c adwya
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
```

### 2. Schema migration

```bash
# generates a migration from schema.prisma, applies it, regenerates the client
npm run prisma:migrate

# production deploy (no prompts, applies existing migrations only)
npm run prisma:migrate:deploy
```

`prisma migrate dev` writes SQL files under `prisma/migrations/`. Each migration is replayed in order on `migrate deploy`.

### 3. Raw SQL applied alongside Prisma

A few constraints and indexes can't be expressed in `schema.prisma` (Prisma has no native CHECK-constraint support and we don't enable the `postgresqlExtensions` preview feature). After the first `prisma migrate dev` runs, add a single follow-up migration that contains:

- A `pg_trgm` GIN index on `medicines.name` and `medicines.generic_name` (for fuzzy search — see `domain-notes.md`)
- A `CHECK (rating BETWEEN 1 AND 5)` constraint on `reviews.rating`
- A `CHECK` on `batches` enforcing that exactly one of `warehouse_id` / `branch_id` is set, matching `location_type`

You can author it by hand:

```bash
mkdir -p prisma/migrations/<timestamp>_add_raw_sql_constraints
# write migration.sql in that directory
```

…or run `npx prisma migrate dev --create-only --name add_raw_sql_constraints` to scaffold a Prisma migration file, then hand-edit the SQL inside it.

### 4. Seeding payment methods

The MVP payment methods (`CASH`, `VISA_ON_DELIVERY`, `INSTAPAY`) are seeded rows in `payment_methods`. After migrations, insert them once:

```sql
INSERT INTO payment_methods (code, name, is_active, sort_order) VALUES
  ('CASH',            'Cash on delivery',     true, 1),
  ('VISA_ON_DELIVERY','Visa on delivery',     true, 2),
  ('INSTAPAY',        'InstaPay',             true, 3),
  ('PAYMOB_CARD',     'Paymob (card/wallet)', false, 4);
```

`PAYMOB_CARD` is inserted with `is_active = false` so it can be flipped on without a code deploy when that phase ships.

(Seed script via `prisma db seed` is on the roadmap — see the open items in `domain-notes.md`.)

## Architecture notes

- **Modular monolith.** Each feature is a Nest module under `src/<feature>/` and is wired in `app.module.ts`. The whole thing runs in one process for now; nothing here would block splitting into microservices if/when the order/checkout load demands it.
- **Global `ValidationPipe`.** Registered in `main.ts` with `whitelist: true, forbidNonWhitelisted: true, transform: true`. DTOs use `class-validator` decorators — request bodies are validated before reaching the service.
- **Global `PrismaService`.** Provided by `@Global() PrismaModule`, so feature modules don't need to import it explicitly. The service connects on `onModuleInit` and disconnects on `onModuleDestroy`.
- **DTOs vs. entities.** DTOs are the wire shape; the Prisma model is the persistence shape. They don't have to be 1:1. Decimal columns, for example, are `string` in response DTOs (preserve precision over JSON) and `number` in input DTOs (validated with `maxDecimalPlaces: 2`).
- **Transactions.** Anything that mutates more than one row (checkout, prescription rejection → stock restore, refund) must be a Prisma `$transaction`. See `domain-notes.md` for the explicit checkout flow.

## Conventions

- One DTO per write operation: `create-<entity>.dto.ts`, `update-<entity>.dto.ts` (via `PartialType` / `OmitType` from `@nestjs/mapped-types`). Filter DTOs as `<entity>.filter-dto.ts`. Response DTOs as `<entity>.response-dto.ts`.
- Prisma enums are re-exported from `src/common/enums/index.ts`; DTOs import from there, not `@prisma/client`.
- The Egyptian-phone regex is encapsulated in `IsEgyptianPhone()` from `src/common/validators/phone.validator.ts`. Use it on every phone-shaped field — accept `01XXXXXXXXX` or `+201XXXXXXXXX` (the `01[0125]\d{8}` prefix: Vodafone/Etisalat/Orange/WE).
- Lint config: `eslint.config.mjs` (flat, type-checked). `eslint-plugin-prettier/recommended` makes Prettier violations lint errors. `no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` are warn-only.
- Prettier: single quotes, trailing commas (`all`).

## Health check

`GET /healthz` → `{ "status": "ok" }`. Useful as a container readiness probe; it doesn't touch the database, so it returns 200 even before migrations run.

## License

UNLICENSED (private).
