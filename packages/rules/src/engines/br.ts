import { buildRuleVersionStamp, type TaxCalculationInput } from "@tax-platform/shared";
import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import { brRulePack2026, type BrRulePack2026 } from "../data/br/2026.js";
import { effectiveRate, taxFromProgressiveTable } from "../progressive.js";
import { normalizeCapitalGainAmounts } from "../fx.js";
import { computeForeignTaxCredit } from "../foreign-tax-credit.js";
import type { CarnetLeaoItem } from "../monthly-carne-leao.js";

export type CapitalGainResult = {
  gain: number;
  taxEstimate: number;
  rate: number;
  requiresAdditionalReview: boolean;
};

export function graduatedCapitalGainTax(gain: number, pack: BrRulePack2026): { tax: number; effective: number } {
  let remaining = Math.max(0, gain);
  let tax = 0;
  for (const slice of pack.capitalGainSlices) {
    const width = slice.width === Number.POSITIVE_INFINITY ? remaining : slice.width;
    const part = Math.min(remaining, width);
    tax += part * slice.rate;
    remaining -= part;
    if (remaining <= 0) break;
  }
  return { tax, effective: gain > 0 ? tax / gain : 0 };
}

export function computeCapitalGainBr(
  input: CapitalGainCalculationInput,
  pack: BrRulePack2026 = brRulePack2026
): CapitalGainResult {
  const normalized = normalizeCapitalGainAmounts({
    acquisitionValue: input.acquisitionValue,
    acquisitionCurrency: input.acquisitionCurrency,
    saleValue: input.saleValue,
    saleCurrency: input.saleCurrency,
    targetCurrency: "BRL",
    exchangeRateAcquisition: input.exchangeRateAcquisition,
    exchangeRateSale: input.exchangeRateSale,
    acquisitionDate: input.acquisitionDate,
    saleDate: input.saleDate
  });
  const costBasis = normalized.acquisitionValue * (input.ownershipPercentageSold / 100);
  const proceeds = normalized.saleValue * (input.ownershipPercentageSold / 100);
  const gain = Math.max(0, proceeds - costBasis - input.deductibleExpenses);
  const { tax, effective } = graduatedCapitalGainTax(gain, pack);
  const complex =
    normalized.requiresReview ||
    input.assetType.toLowerCase().includes("trust") ||
    input.assetCountry !== "BR";
  return {
    gain,
    taxEstimate: tax,
    rate: effective,
    requiresAdditionalReview: complex
  };
}

/** Tax on one month's aggregate Carnê-Leão base (BRL). */
export function computeCarneLeaoMonthlyAggregate(pack: BrRulePack2026, monthlyTaxableBrl: number): {
  grossTax: number;
  appliedRate: number;
} {
  const grossTax = taxFromProgressiveTable(monthlyTaxableBrl, pack.monthly);
  return { grossTax, appliedRate: effectiveRate(grossTax, monthlyTaxableBrl) };
}

/** Tax on Carnê-Leão line: Lei 14.754 flat rate or progressive monthly table. */
export function computeCarneLeaoLineTax(
  lineBrl: number,
  pack: BrRulePack2026,
  lei14754Eligible = false
): number {
  if (lei14754Eligible) return lineBrl * pack.lei14754Rate;
  return taxFromProgressiveTable(lineBrl, pack.monthly);
}

/** @deprecated Prefer monthly aggregate via aggregateMonthlyCarnetLeao. */
export function applyCarneLeaoTaxToItems(
  items: CarnetLeaoItem[],
  pack: BrRulePack2026
): CarnetLeaoItem[] {
  return items.map((it) => ({
    ...it,
    calculatedTax: computeCarneLeaoLineTax(it.taxableAmount, pack, it.lei14754Eligible)
  }));
}

export function buildBrAnnualEstimate(input: {
  taxYear: number;
  grossIncomeBrl: number;
  deductionsTotalBrl: number;
  exemptionsTotalBrl: number;
  foreignTaxPaidBrl?: number;
  requiresAdditionalReview: boolean;
  pack?: BrRulePack2026;
}): TaxCalculationInput {
  const pack = input.pack ?? brRulePack2026;
  const taxableBase = Math.max(0, input.grossIncomeBrl - input.deductionsTotalBrl - input.exemptionsTotalBrl);
  const grossTax = taxFromProgressiveTable(taxableBase, pack.annual);
  const foreign = input.foreignTaxPaidBrl ?? 0;
  const taxCreditApplied = computeForeignTaxCredit(foreign, grossTax);
  const netTaxDue = Math.max(0, grossTax - taxCreditApplied);
  const appliedRate = effectiveRate(grossTax, taxableBase);
  return {
    taxYear: input.taxYear,
    calculationType: "annual_estimate",
    grossIncome: input.grossIncomeBrl,
    deductionsTotal: input.deductionsTotalBrl,
    exemptionsTotal: input.exemptionsTotalBrl,
    taxableBase,
    appliedRate,
    grossTax,
    foreignTaxPaid: foreign,
    taxCreditApplied,
    netTaxDue,
    currency: "BRL",
    calculationStatus: input.requiresAdditionalReview ? "preliminary" : "complete",
    requiresAdditionalReview: input.requiresAdditionalReview,
    ruleVersion: buildRuleVersionStamp(pack.dataPackId),
    jurisdiction: "BR",
    dataPackVersion: pack.dataPackId
  };
}
