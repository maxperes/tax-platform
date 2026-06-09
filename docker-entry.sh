#!/bin/sh
set -eu
cd /app/apps/api
SKIP="${SKIP_MIGRATE_ON_START:-}"
if [ "$SKIP" != "true" ] && [ "$SKIP" != "1" ] && [ "$SKIP" != "yes" ]; then
  if [ "${DATABASE_IAM_AUTH:-}" = "true" ] || [ "${DATABASE_IAM_AUTH:-}" = "1" ] || [ "${DATABASE_IAM_AUTH:-}" = "yes" ]; then
    if [ -z "${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:-}" ] && [ -z "${AWS_CONTAINER_CREDENTIALS_FULL_URI:-}" ]; then
      echo "[docker-entry] ERROR: RDS IAM auth is on but ECS did not inject task credentials (no AWS_CONTAINER_CREDENTIALS_*). Attach an IAM Task role to the task definition (not only the execution role), then force a new deployment." >&2
      exit 1
    fi
    MIGRATE_URL="$(node dist/print-database-url.js)"
    DATABASE_URL="$MIGRATE_URL" pnpm exec prisma migrate deploy
  else
    pnpm exec prisma migrate deploy
  fi
fi
exec node dist/index.js
