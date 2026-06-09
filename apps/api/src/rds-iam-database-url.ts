import { Signer } from "@aws-sdk/rds-signer";

export type BuildPrismaDatabaseUrlInput = {
  databaseUrl: string;
  iamAuth: boolean;
  /** AWS region of the RDS instance (used to sign the auth token). */
  iamRegion: string;
};

/**
 * Builds the `DATABASE_URL` Prisma should use. When `iamAuth` is true, replaces (or sets)
 * the URL password with a short-lived RDS IAM auth token and enforces `sslmode=require`.
 */
export async function buildPrismaDatabaseUrl(input: BuildPrismaDatabaseUrlInput): Promise<string> {
  const base = input.databaseUrl?.trim();
  if (!base) {
    throw new Error("DATABASE_URL is required");
  }
  if (!input.iamAuth) {
    return base;
  }
  if (!input.iamRegion) {
    throw new Error(
      "DATABASE_IAM_REGION or AWS_REGION must be set when DATABASE_IAM_AUTH is true (region of the RDS instance)"
    );
  }
  const withToken = await appendRdsIamPassword(base, input.iamRegion);
  return ensureSslmodeRequire(withToken);
}

function ensureSslmodeRequire(connectionUrl: string): string {
  const u = new URL(connectionUrl);
  if (!u.searchParams.get("sslmode")) {
    u.searchParams.set("sslmode", "require");
  }
  return u.toString();
}

async function appendRdsIamPassword(connectionUrl: string, region: string): Promise<string> {
  const u = new URL(connectionUrl);
  const username = decodeURIComponent(u.username);
  if (!username) {
    throw new Error("For IAM DB auth, DATABASE_URL must include a database username (e.g. postgresql://dbuser@host:5432/db)");
  }
  const hostname = u.hostname;
  if (!hostname) {
    throw new Error("DATABASE_URL must include a host");
  }
  const port = u.port ? Number(u.port) : 5432;
  const signer = new Signer({
    hostname,
    port,
    username,
    region
  });
  const token = await signer.getAuthToken();
  u.password = token;
  return u.toString();
}
