import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { adminTokenRequiredMiddleware } from "../middleware/admin-token.js";
import { requireAdminMiddleware } from "../middleware/require-admin.js";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createApprovedUser, userCredentialsSchema } from "../services/create-user.js";
import {
  deleteUserAccountAsAdmin,
  DeletionBlockedError,
  UserNotFoundError
} from "../services/delete-user.js";
import {
  isAllowedRuleOverrideKey,
  RULE_OVERRIDE_KEYS
} from "../services/rule-overrides.js";

export const adminRouter = Router();

function requireAdminToken(req: { header: (name: string) => string | undefined }, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (!config.adminToken) return true;
  const token = req.header("x-admin-token");
  if (token !== config.adminToken) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

const jurisdictionSchema = z.enum(["BR", "US"]);

const ruleOverrideBodySchema = z.object({
  jurisdiction: jurisdictionSchema,
  taxYear: z.number().int(),
  key: z.string().min(1),
  valueJson: z.unknown()
});

adminRouter.post(
  "/users",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    const parsed = userCredentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const user = await createApprovedUser(parsed.data.email, parsed.data.password);
      res.status(201).json({
        user: { id: user.id, email: user.email, status: user.status, isAdmin: user.isAdmin }
      });
    } catch (err) {
      if (err instanceof Error && err.name === "UserAlreadyExistsError") {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  })
);

adminRouter.delete(
  "/users/:id",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    try {
      await deleteUserAccountAsAdmin(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof DeletionBlockedError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  })
);

adminRouter.use(authMiddleware);

const userStatusSchema = z.enum(["pending", "approved", "rejected"]);

const userListSelect = {
  id: true,
  email: true,
  status: true,
  isAdmin: true,
  plan: true,
  createdAt: true
} as const;

adminRouter.get(
  "/users",
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const status = userStatusSchema.optional().parse(req.query.status);
    const users = await prisma.user.findMany({
      where: status ? { status } : undefined,
      select: userListSelect,
      orderBy: { createdAt: "desc" }
    });
    res.json({ users });
  })
);

adminRouter.post(
  "/users/:id/approve",
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { status: "approved" },
      select: userListSelect
    });
    res.json({ user });
  })
);

adminRouter.post(
  "/users/:id/reject",
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { status: "rejected" },
      select: userListSelect
    });
    res.json({ user });
  })
);

adminRouter.patch(
  "/users/:id",
  requireAdminMiddleware,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        isAdmin: z.boolean().optional(),
        plan: z.enum(["basic", "pro"]).optional()
      })
      .refine((b) => b.isAdmin !== undefined || b.plan !== undefined, {
        message: "Provide isAdmin and/or plan"
      })
      .parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
        ...(body.plan !== undefined ? { plan: body.plan } : {})
      },
      select: userListSelect
    });
    res.json({ user });
  })
);

/** List rule overrides merged at calculation time. */
adminRouter.get("/rule-overrides", asyncHandler(async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const taxYear = z.coerce.number().optional().parse(req.query.taxYear);
  const jurisdiction = jurisdictionSchema.optional().parse(req.query.jurisdiction);
  const rows = await prisma.ruleOverride.findMany({
    where: {
      ...(taxYear !== undefined ? { taxYear } : {}),
      ...(jurisdiction ? { jurisdiction } : {})
    },
    orderBy: [{ taxYear: "desc" }, { jurisdiction: "asc" }, { key: "asc" }]
  });
  res.json({ keys: RULE_OVERRIDE_KEYS, overrides: rows });
}));

adminRouter.post(
  "/rule-overrides",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    const body = ruleOverrideBodySchema.parse(req.body);
    if (!isAllowedRuleOverrideKey(body.jurisdiction, body.key)) {
      res.status(400).json({
        error: "Invalid override key for jurisdiction",
        allowedKeys: RULE_OVERRIDE_KEYS[body.jurisdiction]
      });
      return;
    }
    const row = await prisma.ruleOverride.upsert({
      where: {
        jurisdiction_taxYear_key: {
          jurisdiction: body.jurisdiction,
          taxYear: body.taxYear,
          key: body.key
        }
      },
      create: {
        jurisdiction: body.jurisdiction,
        taxYear: body.taxYear,
        key: body.key,
        valueJson: body.valueJson as object
      },
      update: { valueJson: body.valueJson as object }
    });
    res.status(201).json(row);
  })
);

adminRouter.patch(
  "/rule-overrides/:id",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    const valueJson = z.object({ valueJson: z.unknown() }).parse(req.body).valueJson;
    const existing = await prisma.ruleOverride.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = await prisma.ruleOverride.update({
      where: { id: existing.id },
      data: { valueJson: valueJson as object }
    });
    res.json(row);
  })
);

adminRouter.delete(
  "/rule-overrides/:id",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    const existing = await prisma.ruleOverride.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.ruleOverride.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);

/** Recompute tax pipeline for every user with a session in the given tax year (async job). */
adminRouter.post(
  "/rules/recompute-sessions",
  adminTokenRequiredMiddleware,
  asyncHandler(async (req, res) => {
    const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
    const { enqueueJob, JOB_NAMES } = await import("../services/jobs/queue.js");
    const { jobId, mode } = await enqueueJob(JOB_NAMES.recomputeSessions, { taxYear });
    res.status(202).json({ jobId, mode, taxYear });
  })
);
