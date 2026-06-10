import {
  computeCapitalGain,
  buildUsAnnualEstimate,
  getUsRulePackForYear,
  resolveBrDataPackId,
  resolveUsDataPackId,
  includesInOrdinaryAnnual,
  resolveUsdFromIncome
} from "@tax-platform/rules";
import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import type { CapitalGainCalculation } from "@prisma/client";
import { buildStampWithOverrides, loadRulePatches } from "../rule-overrides.js";
import { getFiscalProfile } from "./income.js";
import { prisma } from "../../db.js";

export async function createCapitalGainCalculation(
  userId: string,
  taxYear: number,
  capitalGain: CapitalGainCalculationInput
): Promise<{ row: CapitalGainCalculation; result: ReturnType<typeof computeCapitalGain> }> {
  const profile = await getFiscalProfile(userId, taxYear);
  const jurisdiction: "BR" | "US" = profile === "resident_usa" ? "US" : "BR";
  const patches = await loadRulePatches(jurisdiction, taxYear);

  let input = { ...capitalGain };
  if (input.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: input.assetId, userId, taxYear }
    });
    if (asset) {
      input = {
        ...input,
        acquisitionValue: asset.acquisitionValue.toNumber(),
        acquisitionCurrency: asset.acquisitionCurrency,
        acquisitionDate: asset.acquisitionDate.toISOString().slice(0, 10)
      };
    }
  }

  let ordinaryTaxableIncomeUsd = 0;
  if (jurisdiction === "US") {
    const [incomes, deductions, exemptionRows] = await Promise.all([
      prisma.incomeSource.findMany({ where: { userId, taxYear } }),
      prisma.deduction.findMany({ where: { userId, taxYear } }),
      prisma.exemption.findMany({ where: { userId, taxYear } })
    ]);
    let grossUsd = 0;
    for (const row of incomes) {
      const cls = row.classification as { calculationModule?: string; taxTreatment?: string } | null;
      if (!includesInOrdinaryAnnual(cls)) continue;
      const fx = resolveUsdFromIncome({
        grossAmount: row.grossAmount.toNumber(),
        originalCurrency: row.originalCurrency,
        paymentDate: row.paymentDate.toISOString().slice(0, 10)
      });
      grossUsd += fx.amountUsd;
    }
    let dedUsd = 0;
    for (const d of deductions) {
      if (d.currency === "USD") dedUsd += d.amount.toNumber();
    }
    const exemptionsUsd = exemptionRows
      .filter((e) => e.applicationScope === "annual" && e.currency === "USD")
      .reduce((s, e) => s + e.amount.toNumber(), 0);
    const usPack = getUsRulePackForYear(taxYear, patches);
    const est = buildUsAnnualEstimate({
      taxYear,
      grossIncomeUsd: grossUsd,
      deductionsUsd: dedUsd,
      exemptionsUsd,
      filingStatus: "single",
      requiresAdditionalReview: false,
      pack: usPack
    });
    ordinaryTaxableIncomeUsd = est.taxableBase;
  }

  const result = computeCapitalGain(input, jurisdiction, { ordinaryTaxableIncomeUsd });
  const dataPack = jurisdiction === "US" ? resolveUsDataPackId(taxYear) : resolveBrDataPackId(taxYear);
  const ruleVersion = buildStampWithOverrides(dataPack, patches);
  const row = await prisma.capitalGainCalculation.create({
    data: {
      userId,
      taxYear,
      assetId: capitalGain.assetId ?? null,
      assetType: capitalGain.assetType,
      assetCountry: capitalGain.assetCountry,
      acquisitionDate: new Date(input.acquisitionDate),
      acquisitionValue: input.acquisitionValue,
      acquisitionCurrency: input.acquisitionCurrency,
      saleDate: new Date(capitalGain.saleDate),
      saleValue: capitalGain.saleValue,
      saleCurrency: capitalGain.saleCurrency,
      ownershipPercentageSold: capitalGain.ownershipPercentageSold,
      deductibleExpenses: capitalGain.deductibleExpenses,
      foreignTaxPaid: capitalGain.foreignTaxPaid ?? null,
      gainAmount: result.gain,
      taxEstimate: result.taxEstimate,
      ruleVersion,
      jurisdiction,
      dataPackVersion: dataPack,
      requiresAdditionalReview: result.requiresAdditionalReview
    }
  });
  return { row, result };
}
