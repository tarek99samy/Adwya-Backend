# Phase 1 — Auth + Identity

Roadmap reference: `roadmap.md` §1.1–§1.6.

## Decisions locked this session

1. **Forgot-password → token-based reset** (no security-question schema change; replaces roadmap §1.1's question flow with industry-standard token flow).
2. **Login by phone only** (matches current schema: `phone @unique`, `email? @unique`).
3. **RefreshToken table + JwtStrategy** (revocable refresh, matches roadmap §1.2). New `PasswordResetToken` table for forgot-password.

## Tasks

Format: ✔ done · ◼ in progress · ◻ open

```
10 tasks (10 done, 0 in progress, 0 open)
  ✔ Step 1  — install @nestjs/passport, passport, passport-jwt, @types/passport-jwt
  ✔ Step 2  — schema.prisma: add RefreshToken + PasswordResetToken models; User relations; new migration `20260728015938_add_auth_tokens`
  ✔ Step 3  — config/app.config.ts + .env: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES_IN=15m, JWT_REFRESH_EXPIRES_IN=14d, PASSWORD_RESET_EXPIRES_IN=15m
  ✔ Step 4  — src/users/users.service.ts + users.module.ts (findByPhone/findByEmail/create/updatePassword/loadPermissions; deny-wins RBAC) + PhoneAlreadyInUseException
  ✔ Step 5  — src/rbac/{decorators/required-permissions, decorators/current-user, guards/permission.guard, rbac.module}.ts
  ✔ Step 6  — auth core: service (login/signup/refresh/logout/verifyUser/resetPassword), strategies/jwt.strategy.ts, guards/jwt-auth.guard.ts, public decorator, controller (8 routes), module. Old auth.guard.ts + csrf.guard.ts deleted.
  ✔ Step 7  — DTOs: login.dto.ts (phone), signup.dto.ts (rewritten for real schema), reset-password.dto.ts (token flow + RefreshTokenDto)
  ✔ Step 8  — src/app.module.ts: import Auth/Users/Rbac, APP_GUARD = JwtAuthGuard (skip-on-Public)
  ✔ Step 9  — tests: auth.service.spec.ts (13 cases) + auth.controller.spec.ts (8 cases) → 21/21 green
  ✔ Step 10 — verification: prisma migrate ✓; start:dev boots ✓; smoke (signup/me/login/refresh+rotation/replay-rejected/wrong-pw/duplicate-phone/forgot-pw+reuse-rejected/login-with-new-pw) all green

## Deviations from the original plan

- `@Public()` was originally planned as class-level on `AuthController`. **Moved to per-route** because class-level makes ALL routes public — including `/auth/me` (sanity-check route). The fix is in `auth.controller.ts`; `@Public()` decorates each public route individually.
- Pre-existing bugs (NOT introduced by Phase 1, NOT fixed by Phase 1, parked):
  - `src/app.controller.spec.ts:19` calls `AppController.getHello()` which doesn't exist — Jest fails 1 test.
  - `eslint.config.mjs:32-33` has a literal multi-line rule name that's a syntax error — `npm run lint` doesn't run.

## Critical files to modify / create

**Modify:**
- `schema.prisma` (root) — add `RefreshToken`, `PasswordResetToken`, User relations.
- `src/auth/auth.controller.ts` — rewrite (delete commented scaffold).
- `src/auth/auth.service.ts` — rewrite.
- `src/auth/auth.module.ts` — rewrite.
- `src/auth/auth.guard.ts` — delete (replaced by `jwt.strategy.ts` + `jwt-auth.guard.ts`).
- `src/auth/csrf.guard.ts` — delete (deferred).
- `src/auth/dto/login.dto.ts` — phone instead of email.
- `src/auth/dto/signup.dto.ts` — rewrite for real schema.
- `src/auth/dto/reset-password.dto.ts` — rewrite for token flow.
- `src/app.module.ts` — wire Auth/Users/Rbac modules + APP_GUARD.
- `src/config/app.config.ts` — declare new JWT_* + reset vars.
- `.env` — add JWT secrets.

**Create:**
- `prisma/migrations/20260728015938_add_auth_tokens/migration.sql` — generated.
- `src/users/users.service.ts`
- `src/users/users.module.ts`
- `src/rbac/decorators/required-permissions.decorator.ts`
- `src/rbac/decorators/current-user.decorator.ts`
- `src/rbac/guards/permission.guard.ts`
- `src/rbac/rbac.module.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/auth/decorators/public.decorator.ts`
- `src/auth/auth.service.spec.ts`
- `src/auth/auth.controller.spec.ts`
```

## Critical files to modify / create

**Modify:**

- `schema.prisma` (root) — add `RefreshToken`, `PasswordResetToken`, User relations.
- `src/auth/auth.controller.ts` — rewrite (delete commented scaffold).
- `src/auth/auth.service.ts` — rewrite.
- `src/auth/auth.module.ts` — rewrite.
- `src/auth/auth.guard.ts` — delete (replaced by `jwt.strategy.ts` + `jwt-auth.guard.ts`).
- `src/auth/csrf.guard.ts` — delete (deferred).
- `src/auth/dto/login.dto.ts` — phone instead of email.
- `src/auth/dto/signup.dto.ts` — rewrite for real schema.
- `src/auth/dto/reset-password.dto.ts` — rewrite for token flow.
- `src/app.module.ts` — wire Auth/Users/Rbac modules + APP_GUARD.
- `src/config/app.config.ts` — declare new JWT_* + reset vars.
- `.env` — add JWT secrets.

**Create:**

- `prisma/migrations/<timestamp>_add_auth_tokens/migration.sql` — generated.
- `src/users/users.service.ts`
- `src/users/users.module.ts`
- `src/rbac/decorators/required-permissions.decorator.ts`
- `src/rbac/decorators/current-user.decorator.ts`
- `src/rbac/guards/permission.guard.ts`
- `src/rbac/rbac.module.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/auth/decorators/public.decorator.ts`
- `src/auth/auth.service.spec.ts`
- `src/auth/auth.controller.spec.ts`

## Reused existing pieces

- `src/common/exceptions/auth.exceptions.ts` — reuse InvalidCredentialsException, EmailAlreadyInUseException, UserNotFoundException; add PhoneAlreadyInUseException.
- `src/common/validators/phone.validator.ts` (`IsEgyptianPhone`) — for LoginDto + RequestPasswordResetDto.
- `src/users/dto/user.response-dto.ts` — wire shape for login/signup/me.
- `src/users/dto/create-user.dto.ts` + `RegisterCustomerDto` — signup uses RegisterCustomerDto.
- `src/common/exception-filter.ts` — every new exception flows through it (no change).
- `main.ts` — global cookieParser/ValidationPipe/healthz already there.

## Out of scope for Phase 1 (per roadmap)

- Catalog/pharmacy read endpoints (Phase 2.1–2.2 — can ship in parallel, public).
- Admin CRUDS (Phase 4.3).
- Email/SMS delivery for password-reset tokens (Phase 4.1).
- Swagger decorations (Phase 4.6).
- Audit log interceptor (Phase 4.4).
- Pre-existing `app.controller.spec.ts:19` getHello() bug — noted, not fixed here.
- CSRF guard — skipped (token-based, no cookie-only sessions).
- Full e2e suite — rolled into Phase 2 alongside checkout e2e.

## Endpoints shipped in Phase 1

```
POST /auth/signup          RegisterCustomerDto  → { user, accessToken, refreshToken }
POST /auth/login           { phone, password }  → { user, accessToken, refreshToken }
POST /auth/refresh         { refreshToken }     → { accessToken, refreshToken }     (rotates; old revoked)
POST /auth/logout          { refreshToken }     → { message: 'Logged out' }
POST /auth/verify-user     { phone }            → { resetToken }                    (Phase-1 stub; Phase 4 swaps for SMS)
POST /auth/reset-password  { token, newPassword } → { message: 'Password reset' }
GET  /auth/me              requires Bearer      → user JSON
```

Plus global `JwtAuthGuard` + `@Public()` opt-out + `@CurrentUser()` decorator + `@RequiredPermissions('orders.create')` decorator + `PermissionGuard`.

## Verification (run after Step 10)

1. `npm run prisma:migrate` — migration applies.
2. `npm run start:dev` — boots, "Prisma connected", listens 3000.
3. `curl -s http://localhost:3000/healthz` — 200 (still public).
4. `POST /auth/signup` with `{"phone":"01001234567","password":"P@ssw0rd123","fullName":"Test"}` — 201, tokens returned.
5. `GET /auth/me` with `Authorization: Bearer <access>` — user JSON.
6. `POST /auth/login` same phone/password — token pair.
7. `POST /auth/refresh` — new pair; old one revoked.
8. `POST /auth/login` wrong password — 401.
9. Reuse of rotated refresh token — 401.
10. `npm run test` — green.
11. `npm run lint` — green.

## Notes for next session

- The original commented `auth.controller.ts` and `auth.service.ts` referenced a different schema (user.password, user.status, user.verification.question/answer) that does NOT match the current User model. They were scaffold from an earlier design and cannot be uncommented — must be rewritten against the real schema (this plan).
- The "verification question" + "email or phone login" wording in roadmap §1.1 is overridden by the three decisions above. Update roadmap.md in this session if you want to keep it as source of truth.
- Postgres password for local dev is `0000`. Do not echo in commit messages.
