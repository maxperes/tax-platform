import { execSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

/**
 * Marks unfinished migrations as rolled back so `migrate deploy` can retry (P3009 recovery).
 * Safe on empty DBs: exits quietly when `_prisma_migrations` does not exist yet.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
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
        env: process.env,
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
