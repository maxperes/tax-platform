import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export { PrismaClient, Prisma } from "./generated/prisma/client.js";
export type * from "./generated/prisma/client.js";

function poolSize(): number {
  const n = Number(process.env.DATABASE_POOL_SIZE);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
}

function withPoolParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(poolSize()));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: withPoolParams(connectionString) });
  return new PrismaClient({ adapter });
}
