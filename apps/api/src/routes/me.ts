import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { PRIVACY_AUDIT_EVENTS } from "../constants/privacy.js";
import {
  buildUserDataExport,
  formatUserDataExportJson
} from "../services/export-user-data.js";
import {
  DeletionBlockedError,
  deleteUserAccount,
  InvalidPasswordError,
  UserNotFoundError
} from "../services/delete-user.js";
import { logPrivacyAuditEvent } from "../services/privacy-audit.js";

export const meRouter = Router();
meRouter.use(authMiddleware);

meRouter.get("/profile", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, isAdmin: true, status: true, createdAt: true }
  });
  res.json(user);
});

meRouter.get("/fiscal-residence/:taxYear", async (req, res) => {
  const taxYear = Number(req.params.taxYear);
  const row = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: req.user!.sub, taxYear } }
  });
  res.json(row ?? null);
});

meRouter.get(
  "/data-export",
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const payload = await buildUserDataExport(userId);
    if (!payload) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.exportRequested, userId);

    const exportedAt = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tax-platform-data-export-${exportedAt}.json"`
    );
    res.send(formatUserDataExportJson(payload));
  })
);

const deleteAccountSchema = z.object({
  password: z.string().min(1),
  confirm: z.literal("DELETE", {
    errorMap: () => ({ message: 'Confirmation must be exactly "DELETE"' })
  })
});

meRouter.post(
  "/delete-account",
  asyncHandler(async (req, res) => {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      await deleteUserAccount(req.user!.sub, parsed.data.password);
      res.status(204).send();
    } catch (err) {
      if (err instanceof InvalidPasswordError) {
        res.status(401).json({ error: err.message });
        return;
      }
      if (err instanceof DeletionBlockedError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  })
);
