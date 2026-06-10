import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createApprovedUser } from "../src/services/create-user.js";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), override: false });

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
  const isAdmin = rawArgs.includes("--admin");
  const args = rawArgs.filter((arg) => arg !== "--admin");
  const [email, password] = args;

  if (!email || !password) {
    console.error(
      "Usage: pnpm --filter @tax-platform/api create-user -- <email> <password> [--admin]"
    );
    process.exit(1);
  }

  try {
    const user = await createApprovedUser(email, password, { isAdmin });
    const role = user.isAdmin ? "admin" : "user";
    console.log(`Created ${role} ${user.email} (${user.id})`);
  } catch (err) {
    if (err instanceof Error && err.name === "UserAlreadyExistsError") {
      console.error(err.message);
      process.exit(1);
    }
    if (err && typeof err === "object" && "flatten" in err) {
      console.error("Validation failed:", (err as { flatten: () => unknown }).flatten());
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
