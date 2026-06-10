import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken } from "../middleware/auth.js";
import { config } from "../config.js";
import { createUser, userCredentialsSchema } from "../services/create-user.js";
import { createUserWithConsent } from "../services/consent.js";

const loginSchema = userCredentialsSchema;

const registerSchema = userCredentialsSchema.extend({
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms and privacy policy" })
  }),
  acceptedSensitiveDataProcessing: z.literal(true, {
    errorMap: () => ({ message: "You must consent to processing of sensitive tax data" })
  })
});

export const authRouter = Router();

authRouter.get("/config", (_req, res) => {
  res.json({
    registrationEnabled: config.registrationEnabled,
    privacyPolicyUrl: config.privacyPolicyUrl || null,
    privacyPolicyVersion: config.privacyPolicyVersion
  });
});

authRouter.post("/register", async (req, res) => {
  if (!config.registrationEnabled) {
    res.status(403).json({ error: "Registration is not open" });
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  try {
    const user = await createUserWithConsent(() => createUser(email, password), {
      ipAddress: req.ip
    });
    const token = signToken({ sub: user.id, email: user.email });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
      return;
    }
    if (err instanceof Error && err.name === "UserAlreadyExistsError") {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ sub: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email } });
});
