#!/bin/sh
set -eu
cd /app/apps/api
SKIP="${SKIP_MIGRATE_ON_START:-}"
if [ "$SKIP" != "true" ] && [ "$SKIP" != "1" ] && [ "$SKIP" != "yes" ]; then
  run_migrate() {
    if ! "$@"; then
      echo "[docker-entry] ERROR: prisma migrate deploy failed." >&2
      echo "[docker-entry] Fresh DB stuck on P3009/P3018? Reset Postgres (or run: prisma migrate resolve --rolled-back <migration>) then redeploy." >&2
      exit 1
    fi
  }
  if [ "${DATABASE_IAM_AUTH:-}" = "true" ] || [ "${DATABASE_IAM_AUTH:-}" = "1" ] || [ "${DATABASE_IAM_AUTH:-}" = "yes" ]; then
    if [ -z "${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:-}" ] && [ -z "${AWS_CONTAINER_CREDENTIALS_FULL_URI:-}" ]; then
      echo "[docker-entry] ERROR: RDS IAM auth is on but ECS did not inject task credentials (no AWS_CONTAINER_CREDENTIALS_*). Attach an IAM Task role to the task definition (not only the execution role), then force a new deployment." >&2
      exit 1
    fi
    MIGRATE_URL="$(node dist/print-database-url.js)"
    run_migrate env DATABASE_URL="$MIGRATE_URL" pnpm exec prisma migrate deploy
  else
    run_migrate pnpm exec prisma migrate deploy
  fi
fi
exec node dist/index.js
