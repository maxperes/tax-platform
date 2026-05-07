# syntax=docker/dockerfile:1
# Single service: API + Vite static build (same origin for /api). Suited to AWS App Runner.
FROM node:20-bookworm AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/rules/package.json packages/rules/
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps ./apps

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

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "cd apps/api && pnpm exec prisma migrate deploy && exec node dist/index.js"]
