#!/bin/sh
set -eu
cd /app/apps/api
# Default: do NOT migrate on every replica boot (horizontal-safe).
# Set MIGRATE_ON_START=true for legacy single-instance deploys, or run migrate in CI/CD.
MIGRATE="${MIGRATE_ON_START:-}"
SKIP="${SKIP_MIGRATE_ON_START:-}"
if [ "$MIGRATE" = "true" ] || [ "$MIGRATE" = "1" ] || [ "$MIGRATE" = "yes" ]; then
  SHOULD_MIGRATE=1
elif [ "$SKIP" = "true" ] || [ "$SKIP" = "1" ] || [ "$SKIP" = "yes" ]; then
  SHOULD_MIGRATE=0
else
  # Production default: skip migrate on start
  if [ "${NODE_ENV:-}" = "production" ]; then
    SHOULD_MIGRATE=0
  else
    SHOULD_MIGRATE=1
  fi
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
  echo "[docker-entry] Skipping migrate on start (set MIGRATE_ON_START=true to enable). Run migrations from CI/CD."
fi

ROLE="${PROCESS_ROLE:-api}"
if [ "$ROLE" = "worker" ]; then
  exec node dist/worker.js
fi
exec node dist/index.js
