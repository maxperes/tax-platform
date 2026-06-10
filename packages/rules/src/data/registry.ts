import { brRulePack2026, type BrRulePack2026 } from "./br/2026.js";
import { usRulePack2026, type UsRulePack2026 } from "./us/2026.js";
import { applyJsonPatchesToBrPack, applyJsonPatchesToUsPack } from "../merge-rule-data.js";

const BR_PACKS_BY_YEAR: Record<number, BrRulePack2026> = {
  2026: brRulePack2026
};

const US_PACKS_BY_YEAR: Record<number, UsRulePack2026> = {
  2026: usRulePack2026
};

export const SUPPORTED_TAX_YEARS = Object.keys(BR_PACKS_BY_YEAR)
  .map(Number)
  .sort((a, b) => a - b);

export function isTaxYearSupported(taxYear: number): boolean {
  return taxYear in BR_PACKS_BY_YEAR && taxYear in US_PACKS_BY_YEAR;
}

/** Nearest registered pack year (falls back to latest available when year has no dedicated pack). */
export function resolvePackTaxYear(taxYear: number): number {
  if (isTaxYearSupported(taxYear)) return taxYear;
  const years = SUPPORTED_TAX_YEARS;
  if (!years.length) throw new Error("No rule data packs registered");
  const prior = years.filter((y) => y <= taxYear);
  if (prior.length) return prior[prior.length - 1]!;
  return years[0]!;
}

export function getBrBasePack(taxYear: number): BrRulePack2026 {
  const year = resolvePackTaxYear(taxYear);
  const pack = BR_PACKS_BY_YEAR[year];
  if (!pack) throw new Error(`No BR rule pack for tax year ${taxYear}`);
  return pack;
}

export function getUsBasePack(taxYear: number): UsRulePack2026 {
  const year = resolvePackTaxYear(taxYear);
  const pack = US_PACKS_BY_YEAR[year];
  if (!pack) throw new Error(`No US rule pack for tax year ${taxYear}`);
  return pack;
}

export function getBrRulePackForYear(
  taxYear: number,
  patches?: { key: string; value: unknown }[]
): BrRulePack2026 {
  const base = getBrBasePack(taxYear);
  if (!patches?.length) return base;
  return applyJsonPatchesToBrPack(base, patches);
}

export function getUsRulePackForYear(
  taxYear: number,
  patches?: { key: string; value: unknown }[]
): UsRulePack2026 {
  const base = getUsBasePack(taxYear);
  if (!patches?.length) return base;
  return applyJsonPatchesToUsPack(base, patches);
}

export function resolveBrDataPackId(taxYear: number): string {
  return getBrBasePack(taxYear).dataPackId;
}

export function resolveUsDataPackId(taxYear: number): string {
  return getUsBasePack(taxYear).dataPackId;
}
