import type { FiscalProfile } from "@tax-platform/shared";
import type { BrRulePack2026 } from "../data/br/2026.js";
import type { UsRulePack2026 } from "../data/us/2026.js";
import {
  getBrRulePackForYear,
  getUsRulePackForYear,
  isTaxYearSupported,
  resolvePackTaxYear,
  SUPPORTED_TAX_YEARS
} from "../data/registry.js";

export type JurisdictionCode = "BR" | "US";

export function jurisdictionsForProfile(profile: FiscalProfile): JurisdictionCode[] {
  if (profile === "dual_residence") return ["BR", "US"];
  if (profile === "resident_brazil") return ["BR"];
  if (profile === "resident_usa") return ["US"];
  if (profile === "non_resident_brazil") return ["BR"];
  return ["BR"];
}

/** @deprecated Use getBrRulePackForYear(taxYear, patches) */
export function getBrRulePack(patches?: { key: string; value: unknown }[]): BrRulePack2026 {
  return getBrRulePackForYear(2026, patches);
}

/** @deprecated Use getUsRulePackForYear(taxYear, patches) */
export function getUsRulePack(patches?: { key: string; value: unknown }[]): UsRulePack2026 {
  return getUsRulePackForYear(2026, patches);
}

export {
  getBrRulePackForYear,
  getUsRulePackForYear,
  isTaxYearSupported,
  resolvePackTaxYear,
  SUPPORTED_TAX_YEARS
};

export * from "./br.js";
export * from "./us.js";
export * from "./facts.js";
export * from "./residency-start.js";
export * from "./income-treatment.js";
export * from "./to-be-impact.js";
export * from "./planning.js";
export * from "./impact-assessment-report.js";
