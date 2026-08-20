#!/bin/sh
set -eu
cd /app/apps/api

ROLE="${PROCESS_ROLE:-api}"
MIGRATE="${MIGRATE_ON_START:-}"
SKIP="${SKIP_MIGRATE_ON_START:-}"

# Default: API applies pending migrations on boot (Railway / single instance).
# Workers skip so they do not race the API. Multi-replica API fleets that migrate
# in CI/CD can set SKIP_MIGRATE_ON_START=true.
if [ "$SKIP" = "true" ] || [ "$SKIP" = "1" ] || [ "$SKIP" = "yes" ] \
  || [ "$MIGRATE" = "false" ] || [ "$MIGRATE" = "0" ] || [ "$MIGRATE" = "no" ]; then
  SHOULD_MIGRATE=0
elif [ "$MIGRATE" = "true" ] || [ "$MIGRATE" = "1" ] || [ "$MIGRATE" = "yes" ]; then
  SHOULD_MIGRATE=1
elif [ "$ROLE" = "worker" ]; then
  SHOULD_MIGRATE=0
else
  SHOULD_MIGRATE=1
fi

if [ "$SHOULD_MIGRATE" = "1" ]; then
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
else
  echo "[docker-entry] Skipping migrate on start (set MIGRATE_ON_START=true to enable, or unset SKIP_MIGRATE_ON_START)."
fi

if [ "$ROLE" = "worker" ]; then
  exec node dist/worker.js
fi
exec node dist/index.js
