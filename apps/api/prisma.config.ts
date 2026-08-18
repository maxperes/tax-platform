import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(apiRoot, "../../.env"), override: false });
loadEnv({ path: path.resolve(apiRoot, ".env"), override: true });

/**
 * Do not use `env("DATABASE_URL")` from `prisma/config` here.
 * That helper throws PrismaConfigEnvError when the var is missing, and every
 * Prisma CLI command loads this file — including `prisma generate`, which never
 * connects. Railway Dockerfile builds do not inject DATABASE_URL.
 */
const GENERATE_PLACEHOLDER_URL =
  "postgresql://prisma-generate:prisma-generate@127.0.0.1:5432/prisma_generate?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL?.trim() || GENERATE_PLACEHOLDER_URL
  }
});
