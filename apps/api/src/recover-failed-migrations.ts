import { execSync } from "node:child_process";
import { createPrismaClient, Prisma } from "./prisma-client.js";

/**
 * Marks unfinished migrations as rolled back so `migrate deploy` can retry (P3009 recovery).
 * Safe on empty DBs: exits quietly when `_prisma_migrations` does not exist yet.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log("[recover-migrations] DATABASE_URL not set; skipping");
    return;
  }
  const prisma = createPrismaClient(url);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL`
    );
    if (rows.length === 0) {
      return;
    }
    for (const { migration_name } of rows) {
      console.log(`[recover-migrations] rolling back failed migration: ${migration_name}`);
      execSync(`pnpm exec prisma migrate resolve --rolled-back "${migration_name}"`, {
        stdio: "inherit",
        env: process.env
      });
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2021" || err.code === "P1001")
    ) {
      console.log("[recover-migrations] no migration history yet; skipping");
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.warn("[recover-migrations] could not recover failed migrations:", err);
});
