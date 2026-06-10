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

export async function createUser(email: string, password: string): Promise<User> {
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
    data: { email: parsed.data.email, passwordHash }
  });
}
