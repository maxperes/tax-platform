import { Router } from "express";
import { z } from "zod";
import { incomeSourceSchema } from "@tax-platform/shared";
import { classifyIncome } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";
import type { FiscalProfile } from "@tax-platform/shared";

export const incomesRouter = Router();
incomesRouter.use(authMiddleware);

incomesRouter.post("/", async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      income: incomeSourceSchema.omit({ classification: true })
    })
    .parse(req.body);

  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: req.user!.sub, taxYear: body.taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const classified = classifyIncome(body.income, profile);

  const row = await prisma.incomeSource.create({
    data: {
      userId: req.user!.sub,
      taxYear: body.taxYear,
      payerName: classified.payerName,
      originCountry: classified.originCountry,
      incomeType: classified.incomeType,
      grossAmount: classified.grossAmount,
      originalCurrency: classified.originalCurrency,
      paymentDate: new Date(classified.paymentDate),
      periodicity: classified.periodicity,
      taxPaidOriginCountry: classified.taxPaidOriginCountry ?? null,
      withholdingTax: classified.withholdingTax ?? null,
      hasProofDocument: classified.hasProofDocument ?? null,
      destinationAccountHint: classified.destinationAccountHint ?? null,
      transferredToBrazil: classified.transferredToBrazil ?? null,
      remainedAbroad: classified.remainedAbroad ?? null,
      nature: classified.nature,
      notes: classified.notes ?? null,
      exchangeRateToBrl: classified.exchangeRateToBrl ?? null,
      grossAmountBrl: classified.grossAmountBrl ?? null,
      classification: classified.classification as Prisma.InputJsonValue
    }
  });
  res.status(201).json(row);
});

incomesRouter.get("/", async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.incomeSource.findMany({
    where: { userId: req.user!.sub, taxYear }
  });
  res.json(rows);
});

incomesRouter.put("/:id", async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      income: incomeSourceSchema.omit({ classification: true })
    })
    .parse(req.body);

  const current = await prisma.incomeSource.findFirst({
    where: { id: req.params.id, userId: req.user!.sub, taxYear: body.taxYear }
  });
  if (!current) {
    res.status(404).json({ error: "Income row not found" });
    return;
  }

  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: req.user!.sub, taxYear: body.taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const classified = classifyIncome(body.income, profile);

  const row = await prisma.incomeSource.update({
    where: { id: current.id },
    data: {
      payerName: classified.payerName,
      originCountry: classified.originCountry,
      incomeType: classified.incomeType,
      grossAmount: classified.grossAmount,
      originalCurrency: classified.originalCurrency,
      paymentDate: new Date(classified.paymentDate),
      periodicity: classified.periodicity,
      taxPaidOriginCountry: classified.taxPaidOriginCountry ?? null,
      withholdingTax: classified.withholdingTax ?? null,
      hasProofDocument: classified.hasProofDocument ?? null,
      destinationAccountHint: classified.destinationAccountHint ?? null,
      transferredToBrazil: classified.transferredToBrazil ?? null,
      remainedAbroad: classified.remainedAbroad ?? null,
      nature: classified.nature,
      notes: classified.notes ?? null,
      exchangeRateToBrl: classified.exchangeRateToBrl ?? null,
      grossAmountBrl: classified.grossAmountBrl ?? null,
      classification: classified.classification as Prisma.InputJsonValue
    }
  });
  res.json(row);
});

incomesRouter.delete("/:id", async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const current = await prisma.incomeSource.findFirst({
    where: { id: req.params.id, userId: req.user!.sub, taxYear }
  });
  if (!current) {
    res.status(404).json({ error: "Income row not found" });
    return;
  }
  await prisma.incomeSource.delete({ where: { id: current.id } });
  res.status(204).send();
});
