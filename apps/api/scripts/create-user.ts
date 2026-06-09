import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createUser } from "../src/services/create-user.js";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), override: false });

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const [email, password] = args;

  if (!email || !password) {
    console.error("Usage: pnpm --filter @tax-platform/api create-user -- <email> <password>");
    process.exit(1);
  }

  try {
    const user = await createUser(email, password);
    console.log(`Created user ${user.email} (${user.id})`);
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
