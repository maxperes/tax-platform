import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { adminTokenRequiredMiddleware } from "../middleware/admin-token.js";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createUser, userCredentialsSchema } from "../services/create-user.js";
import {
  deleteUserAccountAsAdmin,
  DeletionBlockedError,
  UserNotFoundError
} from "../services/delete-user.js";

export const adminRouter = Router();

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
      const user = await createUser(parsed.data.email, parsed.data.password);
      res.status(201).json({ user: { id: user.id, email: user.email } });
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

/** Read-only list of rule overrides merged at calculation time (see `RuleOverride` model). */
adminRouter.get("/rule-overrides", asyncHandler(async (req, res) => {
  if (config.adminToken) {
    const token = req.header("x-admin-token");
    if (token !== config.adminToken) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const taxYear = z.coerce.number().optional().parse(req.query.taxYear);
  const jurisdiction = z.string().optional().parse(req.query.jurisdiction);
  const rows = await prisma.ruleOverride.findMany({
    where: {
      ...(taxYear !== undefined ? { taxYear } : {}),
      ...(jurisdiction ? { jurisdiction } : {})
    },
    orderBy: [{ taxYear: "desc" }, { jurisdiction: "asc" }, { key: "asc" }]
  });
  res.json(rows);
}));
