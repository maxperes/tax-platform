import { buildRuleVersionStamp, type TaxCalculationInput } from "@tax-platform/shared";
import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import type { UsFilingStatus, UsRulePack2026, UsBracketSlice } from "../data/us/2026.js";
import { usRulePack2026 } from "../data/us/2026.js";
import { effectiveRate } from "../progressive.js";
import { normalizeCapitalGainAmounts } from "../fx.js";
import type { CapitalGainResult } from "./br.js";
import { computeForeignTaxCredit } from "../foreign-tax-credit.js";

/** US capital gains — 0/15/20% by holding period; short-term stacks on ordinary brackets when provided. */
export function computeCapitalGainUs(
  input: CapitalGainCalculationInput,
  ordinaryTaxableIncomeUsd = 0,
  pack: UsRulePack2026 = usRulePack2026
): CapitalGainResult {
  const normalized = normalizeCapitalGainAmounts({
    acquisitionValue: input.acquisitionValue,
    acquisitionCurrency: input.acquisitionCurrency,
    saleValue: input.saleValue,
    saleCurrency: input.saleCurrency,
    targetCurrency: "USD",
    exchangeRateAcquisition: input.exchangeRateAcquisition,
    exchangeRateSale: input.exchangeRateSale,
    acquisitionDate: input.acquisitionDate,
    saleDate: input.saleDate
  });
  const costBasis = normalized.acquisitionValue * (input.ownershipPercentageSold / 100);
  const proceeds = normalized.saleValue * (input.ownershipPercentageSold / 100);
  const gain = Math.max(0, proceeds - costBasis - input.deductibleExpenses);
  const acq = new Date(input.acquisitionDate);
  const sale = new Date(input.saleDate);
  const holdingDays = Math.max(0, Math.floor((sale.getTime() - acq.getTime()) / 86400000));
  const longTerm = holdingDays >= 365;
  let rate: number;
  let taxEstimate: number;
  let requiresReview =
    normalized.requiresReview ||
    input.assetType.toLowerCase().includes("trust") ||
    input.assetCountry !== "US";

  if (!longTerm) {
    const brackets = pack.brackets.single;
    const taxBefore = computeUsFederalTax2(ordinaryTaxableIncomeUsd, brackets);
    const taxAfter = computeUsFederalTax2(ordinaryTaxableIncomeUsd + gain, brackets);
    taxEstimate = Math.max(0, taxAfter - taxBefore);
    rate = gain > 0 ? taxEstimate / gain : 0;
    requiresReview ||= gain > 0 && taxEstimate === 0;
  } else {
    const taxableIncome = ordinaryTaxableIncomeUsd + gain;
    if (taxableIncome <= 470_000) rate = 0.15;
    else if (gain <= 492_300) rate = 0.15;
    else rate = 0.2;
    taxEstimate = gain * rate;
  }
  return {
    gain,
    taxEstimate,
    rate,
    requiresAdditionalReview: requiresReview
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
  /** Passive-basket foreign tax (Form 1116 simplified). */
  passiveForeignTaxPaidUsd?: number;
  /** General-basket foreign tax. */
  generalForeignTaxPaidUsd?: number;
  /** Passive income for basket-limited FTC. */
  passiveIncomeUsd?: number;
  /** General (earned) income for basket-limited FTC. */
  generalIncomeUsd?: number;
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

  const passiveIncome = input.passiveIncomeUsd ?? 0;
  const generalIncome = input.generalIncomeUsd ?? Math.max(0, taxableBase - passiveIncome);
  const passiveShare = taxableBase > 0 ? passiveIncome / taxableBase : 0;
  const generalShare = taxableBase > 0 ? generalIncome / taxableBase : 1;
  const passiveTaxUsd = grossTax * passiveShare;
  const generalTaxUsd = grossTax * generalShare;
  const passiveForeign = input.passiveForeignTaxPaidUsd ?? foreign * passiveShare;
  const generalForeign = input.generalForeignTaxPaidUsd ?? foreign * generalShare;
  const passiveCredit = computeForeignTaxCredit(passiveForeign, passiveTaxUsd);
  const generalCredit = computeForeignTaxCredit(generalForeign, generalTaxUsd);
  const ftcApplied = passiveCredit + generalCredit;
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
