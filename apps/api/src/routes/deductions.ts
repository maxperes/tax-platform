import { Router } from "express";
import { z } from "zod";
import { deductionSchema } from "@tax-platform/shared";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { createDeduction } from "../services/persistence/deduction.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const deductionsRouter = Router();
deductionsRouter.use(authMiddleware);

deductionsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ taxYear: z.number().int(), deduction: deductionSchema }).parse(req.body);
  const result = await createDeduction(req.user!.sub, body.taxYear, body.deduction);
  if (!result.ok) {
    res.status(400).json({ errors: result.errors });
    return;
  }
  res.status(201).json(result.row);
}));

deductionsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.deduction.findMany({ where: { userId: req.user!.sub, taxYear } });
  res.json(rows);
}));
