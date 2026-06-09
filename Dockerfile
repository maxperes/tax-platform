# syntax=docker/dockerfile:1
# Single service: API + Vite static build (same origin for /api). Suited to AWS App Runner.
FROM node:20-bookworm AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @tax-platform/shared build \
  && pnpm --filter @tax-platform/rules build \
  && pnpm --filter @tax-platform/api exec prisma generate \
  && pnpm --filter @tax-platform/api build \
  && pnpm --filter @tax-platform/web build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_DIST=/app/apps/web/dist

COPY --from=builder /app /app
COPY docker-entry.sh /app/docker-entry.sh
RUN chmod +x /app/docker-entry.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Same flow as before: migrate deploy then node. IAM: migrate uses a one-off token (print-database-url.js).
CMD ["/app/docker-entry.sh"]
