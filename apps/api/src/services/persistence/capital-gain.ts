import { computeCapitalGain } from "@tax-platform/rules";
import { DATA_PACK_BR_2026, DATA_PACK_US_2026 } from "@tax-platform/shared";
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
  const result = computeCapitalGain(capitalGain, jurisdiction);
  const dataPack = jurisdiction === "US" ? DATA_PACK_US_2026 : DATA_PACK_BR_2026;
  const ruleVersion = buildStampWithOverrides(dataPack, patches);
  const row = await prisma.capitalGainCalculation.create({
    data: {
      userId,
      taxYear,
      assetType: capitalGain.assetType,
      assetCountry: capitalGain.assetCountry,
      acquisitionDate: new Date(capitalGain.acquisitionDate),
      acquisitionValue: capitalGain.acquisitionValue,
      acquisitionCurrency: capitalGain.acquisitionCurrency,
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
