import { Router } from "express";
import { z } from "zod";
import { capitalGainCalculationSchema, buildRuleVersionStamp, DATA_PACK_BR_2026, DATA_PACK_US_2026 } from "@tax-platform/shared";
import { computeCapitalGain } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

export const capitalGainsRouter = Router();
capitalGainsRouter.use(authMiddleware);

capitalGainsRouter.post("/", async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      capitalGain: capitalGainCalculationSchema
    })
    .parse(req.body);
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: req.user!.sub, taxYear: body.taxYear } }
  });
  const jurisdiction: "BR" | "US" = fp?.derivedProfile === "resident_usa" ? "US" : "BR";
  const result = computeCapitalGain(body.capitalGain, jurisdiction);
  const dataPack = jurisdiction === "US" ? DATA_PACK_US_2026 : DATA_PACK_BR_2026;
  const row = await prisma.capitalGainCalculation.create({
    data: {
      userId: req.user!.sub,
      taxYear: body.taxYear,
      assetType: body.capitalGain.assetType,
      assetCountry: body.capitalGain.assetCountry,
      acquisitionDate: new Date(body.capitalGain.acquisitionDate),
      acquisitionValue: body.capitalGain.acquisitionValue,
      acquisitionCurrency: body.capitalGain.acquisitionCurrency,
      saleDate: new Date(body.capitalGain.saleDate),
      saleValue: body.capitalGain.saleValue,
      saleCurrency: body.capitalGain.saleCurrency,
      ownershipPercentageSold: body.capitalGain.ownershipPercentageSold,
      deductibleExpenses: body.capitalGain.deductibleExpenses,
      foreignTaxPaid: body.capitalGain.foreignTaxPaid ?? null,
      gainAmount: result.gain,
      taxEstimate: result.taxEstimate,
      ruleVersion: buildRuleVersionStamp(dataPack),
      jurisdiction,
      dataPackVersion: dataPack,
      requiresAdditionalReview: result.requiresAdditionalReview
    }
  });
  res.status(201).json({ row, result });
});

capitalGainsRouter.get("/", async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.capitalGainCalculation.findMany({
    where: { userId: req.user!.sub, taxYear }
  });
  res.json(rows);
});
