#!/bin/sh
# Entrypoint for both the api and worker containers. APP_ROLE picks which.
set -e

# Only the API runs migrations. If every worker replica also ran them they
# would race on the same advisory lock at deploy time, and a worker has no
# business changing the schema.
if [ "$APP_ROLE" = "api" ] && [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying migrations..."
  npx prisma migrate deploy
fi

# Seeding is opt-in. It is idempotent, but making it automatic means a
# production boot could quietly rewrite permission grants.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] seeding reference data..."
  npm run prisma:seed:dist
fi

case "$APP_ROLE" in
  api)
    echo "[entrypoint] starting API"
    exec node dist/main
    ;;
  worker)
    echo "[entrypoint] starting worker"
    exec node dist/worker
    ;;
  *)
    echo "[entrypoint] unknown APP_ROLE '$APP_ROLE' (expected 'api' or 'worker')" >&2
    exit 1
    ;;
esac
