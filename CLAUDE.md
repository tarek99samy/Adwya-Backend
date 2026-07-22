# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

`adwya-backend` is the server-side of the **Adwya** app — a platform for purchasing medicine online from nearby pharmacies. From the customer side, users search medicines, choose a pharmacy (by choice or by closest geographically), add to cart, and check out (initially cash, visa on delivery, InstaPay; later in-app/card payments). From the pharmacy side, there is a dashboard for registration, document upload, and catalog management. Future scope: in-app customer-service chat, push notifications, and a separate admin dashboard.

The current source tree is still the NestJS scaffold — domain modules for users, pharmacies, medicines, cart, orders, payments, etc. do not exist yet. New work should introduce them as Nest modules under `src/`.

Always optimize tokens usage and try to do only requested tasks only

## Tech stack

- NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`).
- TypeScript 5.7, target ES2023, NodeNext modules.
- Jest 30 for unit + e2e tests, ts-jest, supertest for HTTP.
- ESLint 9 (flat config, `typescript-eslint` type-checked) + Prettier 3.
- Runtime: Node 24+ types, reflect-metadata, RxJS 7.

## Common commands

All commands run from the repository root.

```bash
# install
npm install

# dev (watch mode, recommended while editing)
npm run start:dev

# debug (watch + node inspector)
npm run start:debug

# one-shot dev start / production
npm run start
npm run build && npm run start:prod   # serves compiled dist/

# lint (auto-fix) and format
npm run lint
npm run format

# tests
npm run test              # unit tests (src/**/*.spec.ts)
npm run test:watch        # unit tests in watch mode
npm run test:cov          # unit tests + coverage to ../coverage
npm run test:e2e          # e2e tests (test/**/*.e2e-spec.ts) using test/jest-e2e.json
npm run test:debug        # run jest with --inspect-brk
```

To run a single unit test file, narrow Jest's pattern: `npx jest src/path/to/file.spec.ts` (or `npm run test -- src/path/to/file.spec.ts`). For a single e2e file, use `npx jest --config ./test/jest-e2e.json test/path/to/file.e2e-spec.ts`.

## Architecture and layout

```
src/
  main.ts            # bootstrap: NestFactory.create(AppModule), listens on PORT or 3000
  app.module.ts      # root @Module — currently registers only AppController + AppService
  app.controller.ts  # @Controller() with GET / -> AppService.getHello()
  app.service.ts     # @Injectable AppService
  *.spec.ts          # co-located unit tests (Jest rootDir = src)
test/
  app.e2e-spec.ts    # e2e test that imports AppModule and hits GET /
  jest-e2e.json      # e2e Jest config (rootDir = test, regex = .e2e-spec.ts$)
```

- `main.ts` (`src/main.ts:1`) is the only entry point; it uses `process.env.PORT ?? 3000`, so set `PORT` for non-default ports.
- The root module composition is in `src/app.module.ts:1`. New features should be added as feature modules here (and, for HTTP-facing functionality, controllers registered in their module's `controllers` array).
- `nest-cli.json` sets `sourceRoot: src` and `deleteOutDir: true`, so `npm run build` writes to `dist/` and wipes it on each build. The build excludes `node_modules`, `test`, `dist`, and `**/*spec.ts` (`tsconfig.build.json`).
- Jest's `rootDir` is `src` for unit tests and `.` (with the e2e config) for e2e; coverage lands in `../coverage`.

## Tooling notes

- Prettier: single quotes, trailing commas (`all`) — `.prettierrc`.
- ESLint: flat config in `eslint.config.mjs`; runs with type-checked rules. `eslint-plugin-prettier/recommended` is loaded, so Prettier violations are reported as ESLint errors. The config also downgrades/exempts a few rules (`no-explicit-any` off, `no-floating-promises` and `no-unsafe-argument` as warn).
- TypeScript: `noImplicitAny`, `strictBindCallApply`, and `noFallthroughCasesInSwitch` are off; `strictNullChecks` is on. Prefer `import type { ... }` for type-only imports (NodeNext + `isolatedModules`).
- `.env*` files are gitignored; load env via standard mechanisms (e.g. `@nestjs/config` when added) before reading `process.env` outside `main.ts`.
</content>
</invoke>