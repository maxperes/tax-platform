import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "../prisma-client.js";
import { prisma } from "../db.js";

export const userCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export class UserAlreadyExistsError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "UserAlreadyExistsError";
  }
}

async function createUserRecord(
  email: string,
  password: string,
  opts: { status: "pending" | "approved"; isAdmin?: boolean }
): Promise<User> {
  const parsed = userCredentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    throw parsed.error;
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    throw new UserAlreadyExistsError();
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  return prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      status: opts.status,
      isAdmin: opts.isAdmin ?? false
    }
  });
}

/** Self-registration: account awaits admin approval. */
export async function createUser(email: string, password: string): Promise<User> {
  return createUserRecord(email, password, { status: "pending", isAdmin: false });
}

/** Admin/CLI provisioning: account is immediately active. */
export async function createApprovedUser(
  email: string,
  password: string,
  opts?: { isAdmin?: boolean }
): Promise<User> {
  return createUserRecord(email, password, { status: "approved", isAdmin: opts?.isAdmin });
}
