import { Router } from "express";
import { z } from "zod";
import { incomeSourceSchema } from "@tax-platform/shared";
import { classifyIncome } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  classifiedIncomeUpdateData,
  createClassifiedIncome,
  getFiscalProfile
} from "../services/persistence/income.js";

export const incomesRouter = Router();
incomesRouter.use(authMiddleware);

incomesRouter.post("/", asyncHandler(async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      income: incomeSourceSchema.omit({ classification: true })
    })
    .parse(req.body);

  const row = await createClassifiedIncome(req.user!.sub, body.taxYear, body.income);
  res.status(201).json(row);
}));

incomesRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.incomeSource.findMany({
    where: { userId: req.user!.sub, taxYear }
  });
  res.json(rows);
}));

incomesRouter.put("/:id", asyncHandler(async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      income: incomeSourceSchema.omit({ classification: true })
    })
    .parse(req.body);

  const current = await prisma.incomeSource.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub, taxYear: body.taxYear }
  });
  if (!current) {
    res.status(404).json({ error: "Income row not found" });
    return;
  }

  const profile = await getFiscalProfile(req.user!.sub, body.taxYear);
  const classified = classifyIncome(body.income, profile);

  const row = await prisma.incomeSource.update({
    where: { id: current.id },
    data: classifiedIncomeUpdateData(req.user!.sub, body.taxYear, classified)
  });
  res.json(row);
}));

incomesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const current = await prisma.incomeSource.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub, taxYear }
  });
  if (!current) {
    res.status(404).json({ error: "Income row not found" });
    return;
  }
  await prisma.incomeSource.delete({ where: { id: current.id } });
  res.status(204).send();
}));
