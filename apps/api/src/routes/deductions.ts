import { Router } from "express";
import { z } from "zod";
import { deductionSchema } from "@tax-platform/shared";
import { validateDeductionForMvp } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

export const deductionsRouter = Router();
deductionsRouter.use(authMiddleware);

deductionsRouter.post("/", async (req, res) => {
  const body = z.object({ taxYear: z.number().int(), deduction: deductionSchema }).parse(req.body);
  const v = validateDeductionForMvp(body.deduction);
  if (!v.ok) {
    res.status(400).json({ errors: v.errors });
    return;
  }
  const d = body.deduction;
  const row = await prisma.deduction.create({
    data: {
      userId: req.user!.sub,
      taxYear: body.taxYear,
      deductionType: d.deductionType,
      relatedIncomeId: d.relatedIncomeId ?? null,
      relatedEventId: d.relatedEventId ?? null,
      relatedAssetId: d.relatedAssetId ?? null,
      amount: d.amount,
      currency: d.currency,
      exchangeRate: d.exchangeRate ?? null,
      amountBrl: d.amountBrl ?? null,
      taxPeriod: d.taxPeriod,
      applicationScope: d.applicationScope,
      isRecurring: d.isRecurring ?? null,
      isEligible: d.isEligible ?? null,
      requiresProof: d.requiresProof ?? null,
      proofDocumentUrl: d.proofDocumentUrl ?? null,
      notes: d.notes ?? null
    }
  });
  res.status(201).json(row);
});

deductionsRouter.get("/", async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.deduction.findMany({ where: { userId: req.user!.sub, taxYear } });
  res.json(rows);
});
