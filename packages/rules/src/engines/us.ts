import { buildRuleVersionStamp, type TaxCalculationInput } from "@tax-platform/shared";
import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import type { UsFilingStatus, UsRulePack2026, UsBracketSlice } from "../data/us/2026.js";
import { usRulePack2026 } from "../data/us/2026.js";
import { effectiveRate } from "../progressive.js";
import type { CapitalGainResult } from "./br.js";

/** US capital gains — MVP: net gain taxed at 15% (long-term simplified); SME to wire 0/15/20% holding periods. */
export function computeCapitalGainUs(input: CapitalGainCalculationInput): CapitalGainResult {
  const costBasis = input.acquisitionValue * (input.ownershipPercentageSold / 100);
  const proceeds = input.saleValue * (input.ownershipPercentageSold / 100);
  const gain = Math.max(0, proceeds - costBasis - input.deductibleExpenses);
  const rate = 0.15;
  const complex = input.assetType.toLowerCase().includes("trust") || input.assetCountry !== "US";
  return {
    gain,
    taxEstimate: gain * rate,
    rate,
    requiresAdditionalReview: complex
  };
}

/** US ordinary income marginal tax (post-standard-deduction taxable base). */
export function computeUsFederalTax2(taxableIncome: number, brackets: UsBracketSlice[]): number {
  const t = Math.max(0, taxableIncome);
  let tax = 0;
  let prevTop = 0;
  for (const b of brackets) {
    const inBracket = Math.max(0, Math.min(t, b.high) - prevTop);
    tax += inBracket * b.rate;
    prevTop = b.high;
    if (t <= b.high) break;
  }
  return tax;
}

export type UsAnnualEstimateInput = {
  taxYear: number;
  grossIncomeUsd: number;
  deductionsUsd: number;
  exemptionsUsd: number;
  foreignTaxPaidUsd?: number;
  /** Foreign earned income eligible for FEIE (Form 2555) */
  foreignEarnedIncomeUsd?: number;
  /** Net investment income for NIIT (Form 8960) */
  netInvestmentIncomeUsd?: number;
  filingStatus: UsFilingStatus;
  requiresAdditionalReview: boolean;
  pack?: UsRulePack2026;
};

export function buildUsAnnualEstimate(input: UsAnnualEstimateInput): TaxCalculationInput {
  const pack = input.pack ?? usRulePack2026;
  const std = pack.standardDeduction[input.filingStatus];
  const feie = Math.min(input.foreignEarnedIncomeUsd ?? 0, pack.feieLimit);
  const adjustedGross = Math.max(0, input.grossIncomeUsd - feie);
  const taxableBase = Math.max(0, adjustedGross - input.deductionsUsd - input.exemptionsUsd - std);
  const brackets = pack.brackets[input.filingStatus];
  const grossTax = computeUsFederalTax2(taxableBase, brackets);
  const foreign = input.foreignTaxPaidUsd ?? 0;
  const ftcApplied = Math.min(foreign, grossTax);
  const netAfterFtc = Math.max(0, grossTax - ftcApplied);
  const magi = adjustedGross;
  const nii = input.netInvestmentIncomeUsd ?? 0;
  const niitThreshold =
    input.filingStatus === "mfj" ? pack.niitThresholdMfj : pack.niitThresholdSingle;
  const excessMagi = Math.max(0, magi - niitThreshold);
  const niitBase = Math.min(nii, excessMagi);
  const niit = niitBase * pack.niitRate;
  const netTaxDue = netAfterFtc + niit;
  const appliedRate = effectiveRate(grossTax + niit, Math.max(taxableBase, 1));

  return {
    taxYear: input.taxYear,
    calculationType: "annual_estimate",
    grossIncome: input.grossIncomeUsd,
    deductionsTotal: input.deductionsUsd,
    exemptionsTotal: input.exemptionsUsd + std + feie,
    taxableBase,
    appliedRate,
    grossTax: grossTax + niit,
    foreignTaxPaid: foreign,
    taxCreditApplied: ftcApplied,
    netTaxDue,
    currency: "USD",
    calculationStatus: input.requiresAdditionalReview ? "preliminary" : "complete",
    requiresAdditionalReview: input.requiresAdditionalReview,
    ruleVersion: buildRuleVersionStamp(pack.dataPackId),
    jurisdiction: "US",
    dataPackVersion: pack.dataPackId,
    feieApplied: feie,
    ftcApplied: ftcApplied,
    niit
  };
}

export function fbarFlagForeignBalanceUsd(balanceUsd: number, pack: UsRulePack2026 = usRulePack2026): boolean {
  return balanceUsd >= pack.fbarThreshold;
}

export function form8938FlagSingleResidentAbroad(assetUsd: number, pack: UsRulePack2026 = usRulePack2026): boolean {
  return assetUsd >= pack.form8938SingleResidentAbroad;
}
