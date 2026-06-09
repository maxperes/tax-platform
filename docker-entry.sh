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
    export DATABASE_URL="$(node dist/print-database-url.js)"
  fi
  node dist/recover-failed-migrations.js || true
  if ! pnpm exec prisma migrate deploy; then
    echo "[docker-entry] ERROR: prisma migrate deploy failed." >&2
    echo "[docker-entry] If this persists, reset Postgres in Railway (Settings → Reset Database) and redeploy." >&2
    exit 1
  fi
fi
exec node dist/index.js
