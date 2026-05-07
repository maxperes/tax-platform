import { buildRuleVersionStamp, type TaxCalculationInput } from "@tax-platform/shared";
import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import type { MonthlyTaxCalculationItem } from "@tax-platform/shared";
import { brRulePack2026, type BrRulePack2026 } from "../data/br/2026.js";
import { effectiveRate, taxFromProgressiveTable } from "../progressive.js";

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
  const costBasis = input.acquisitionValue * (input.ownershipPercentageSold / 100);
  const proceeds = input.saleValue * (input.ownershipPercentageSold / 100);
  const gain = Math.max(0, proceeds - costBasis - input.deductibleExpenses);
  const { tax, effective } = graduatedCapitalGainTax(gain, pack);
  const complex = input.assetType.toLowerCase().includes("trust") || input.assetCountry !== "BR";
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

/** Per-income line tax for Carnê-Leão (progressive on line base — MVP: same table as monthly slice). */
export function computeCarneLeaoLineTax(lineBrl: number, pack: BrRulePack2026): number {
  return taxFromProgressiveTable(lineBrl, pack.monthly);
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
  const taxCreditApplied = Math.min(foreign, grossTax);
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

/** Attach per-line calculated tax for monthly items (Carnê-Leão progressive per line — conservative MVP). */
export function applyCarneLeaoTaxToItems(items: MonthlyTaxCalculationItem[], pack: BrRulePack2026): MonthlyTaxCalculationItem[] {
  return items.map((it) => ({
    ...it,
    calculatedTax: computeCarneLeaoLineTax(it.taxableAmount, pack)
  }));
}
