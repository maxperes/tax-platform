import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(apiRoot, "../../.env"), override: false });
loadEnv({ path: path.resolve(apiRoot, ".env"), override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
