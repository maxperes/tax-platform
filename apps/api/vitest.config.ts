import { defineConfig } from "vitest/config";

/**
 * Unit suites often import modules that transitively load `db.ts`, which resolves
 * DATABASE_URL at import time. CI has no .env — provide a non-connecting placeholder.
 * Suites that need a real DB should override DATABASE_URL explicitly.
 */
const TEST_DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://tax:tax@127.0.0.1:5432/tax_platform_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    env: {
      DATABASE_URL: TEST_DATABASE_URL
    }
  }
});
