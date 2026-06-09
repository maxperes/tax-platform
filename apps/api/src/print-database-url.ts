/**
 * Prints a resolved DATABASE_URL to stdout (with RDS IAM token when enabled).
 * Used by docker-entry.sh so `prisma migrate deploy` authenticates without changing
 * the container's base DATABASE_URL for the app process.
 */
import { config } from "./config.js";
import { buildPrismaDatabaseUrl } from "./rds-iam-database-url.js";

const url = await buildPrismaDatabaseUrl({
  databaseUrl: config.databaseUrl,
  iamAuth: config.databaseIamAuth,
  iamRegion: config.databaseIamRegion
});
process.stdout.write(url);
