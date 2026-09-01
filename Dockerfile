# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps — install once, reuse for build and runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

# Copied separately from the source so a code change does not invalidate the
# npm layer.
COPY package*.json ./
# The Prisma client's postinstall generates from prisma/schema.prisma, so the
# schema has to be in the context before `npm ci` - at its real path, not the
# repo root, which is where it used to live.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# ---------------------------------------------------------------------------
# build — compile TypeScript and generate the Prisma client
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build
# Compiled separately: the runtime image has no ts-node (pruned as a devDep).
RUN npm run build:seed

# Drop dev dependencies from the tree we are about to copy forward.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# runtime — the image that actually ships
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# dumb-init reaps zombies and forwards SIGTERM, which is what lets the worker
# drain in-flight jobs on a rolling deploy instead of being killed outright.
RUN apk add --no-cache dumb-init

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY --from=build /app/package*.json ./
# Needed by `prisma migrate deploy` in the entrypoint: prisma/ holds both the
# schema and prisma/migrations, which is the only place Prisma looks for them.
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

# Never run as root.
USER node

EXPOSE 3000

# Compose overrides this for the worker service.
ENV APP_ROLE=api

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
