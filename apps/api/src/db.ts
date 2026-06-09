import { PrismaClient } from "@prisma/client";
import { config } from "./config.js";
import { buildPrismaDatabaseUrl } from "./rds-iam-database-url.js";

async function createClient(url: string): Promise<PrismaClient> {
  return new PrismaClient({
    datasources: { db: { url } }
  });
}

async function resolveUrl(): Promise<string> {
  return buildPrismaDatabaseUrl({
    databaseUrl: config.databaseUrl,
    iamAuth: config.databaseIamAuth,
    iamRegion: config.databaseIamRegion
  });
}

const initialUrl = await resolveUrl();
let _prisma: PrismaClient = await createClient(initialUrl);

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(_prisma, prop, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(_prisma) : value;
  }
});

if (config.databaseIamAuth) {
  const ms = config.databaseIamTokenRefreshMs;
  setInterval(() => {
    void (async () => {
      try {
        const url = await resolveUrl();
        const next = await createClient(url);
        const prev = _prisma;
        _prisma = next;
        await prev.$disconnect();
      } catch (err) {
        console.error("[db] RDS IAM token refresh failed; keeping existing Prisma client", err);
      }
    })();
  }, ms);
}
