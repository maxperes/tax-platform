/**
 * US federal parameters for tax year 2026 (data pack us-2026-1).
 * Brackets and standard deduction indexed from IRS 2025 Rev.Proc. / Publication 17
 * as a working 2026 estimate — confirm with tax SME before production.
 * @see https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2025
 */

export const US_DATA_PACK_ID = "us-2026-1";

export type UsBracketSlice = { low: number; high: number; rate: number };

export type UsFilingStatus = "single" | "mfj" | "hoh";

export const US_STANDARD_DEDUCTION_2026: Record<UsFilingStatus, number> = {
  single: 15750,
  mfj: 31500,
  hoh: 23625
};

/** Taxable income brackets (after standard deduction), single 2025-style → 2026 pack. */
export const US_BRACKETS_SINGLE: UsBracketSlice[] = [
  { low: 0, high: 11925, rate: 0.1 },
  { low: 11925, high: 48475, rate: 0.12 },
  { low: 48475, high: 103350, rate: 0.22 },
  { low: 103350, high: 197300, rate: 0.24 },
  { low: 197300, high: 250525, rate: 0.32 },
  { low: 250525, high: 626350, rate: 0.35 },
  { low: 626350, high: Number.POSITIVE_INFINITY, rate: 0.37 }
];

export const US_BRACKETS_MFJ: UsBracketSlice[] = [
  { low: 0, high: 23850, rate: 0.1 },
  { low: 23850, high: 96950, rate: 0.12 },
  { low: 96950, high: 206700, rate: 0.22 },
  { low: 206700, high: 394600, rate: 0.24 },
  { low: 394600, high: 501050, rate: 0.32 },
  { low: 501050, high: 751600, rate: 0.35 },
  { low: 751600, high: Number.POSITIVE_INFINITY, rate: 0.37 }
];

export const US_BRACKETS_HOH: UsBracketSlice[] = [
  { low: 0, high: 17000, rate: 0.1 },
  { low: 17000, high: 64850, rate: 0.12 },
  { low: 64850, high: 101200, rate: 0.22 },
  { low: 101200, high: 191950, rate: 0.24 },
  { low: 191950, high: 243700, rate: 0.32 },
  { low: 243700, high: 636900, rate: 0.35 },
  { low: 636900, high: Number.POSITIVE_INFINITY, rate: 0.37 }
];

/** Foreign Earned Income Exclusion cap (IRC §911) — estimate for 2026 from 2025 $130k. */
export const US_FEIE_LIMIT_2026 = 130000;

/** Net Investment Income Tax (Form 8960) rate and MAGI thresholds (estimate). */
export const US_NIIT_RATE = 0.038;
export const US_NIIT_THRESHOLD_SINGLE = 200000;
export const US_NIIT_THRESHOLD_MFJ = 250000;

/** FBAR / Form 8938 informational thresholds (flags only, not tax). */
export const US_FBAR_THRESHOLD = 10000;
export const US_FORM_8938_SINGLE_RESIDENT_ABROAD = 200000;

export type UsRulePack2026 = {
  dataPackId: string;
  standardDeduction: Record<UsFilingStatus, number>;
  brackets: Record<UsFilingStatus, UsBracketSlice[]>;
  feieLimit: number;
  niitRate: number;
  niitThresholdSingle: number;
  niitThresholdMfj: number;
  fbarThreshold: number;
  form8938SingleResidentAbroad: number;
};

export const usRulePack2026: UsRulePack2026 = {
  dataPackId: US_DATA_PACK_ID,
  standardDeduction: US_STANDARD_DEDUCTION_2026,
  brackets: {
    single: US_BRACKETS_SINGLE,
    mfj: US_BRACKETS_MFJ,
    hoh: US_BRACKETS_HOH
  },
  feieLimit: US_FEIE_LIMIT_2026,
  niitRate: US_NIIT_RATE,
  niitThresholdSingle: US_NIIT_THRESHOLD_SINGLE,
  niitThresholdMfj: US_NIIT_THRESHOLD_MFJ,
  fbarThreshold: US_FBAR_THRESHOLD,
  form8938SingleResidentAbroad: US_FORM_8938_SINGLE_RESIDENT_ABROAD
};
