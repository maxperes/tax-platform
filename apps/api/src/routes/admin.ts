import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { config } from "../config.js";

export const adminRouter = Router();
adminRouter.use(authMiddleware);

/** Read-only list of rule overrides merged at calculation time (see `RuleOverride` model). */
adminRouter.get("/rule-overrides", async (req, res) => {
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
});
