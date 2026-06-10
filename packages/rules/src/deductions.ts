import type { Exemption } from "@tax-platform/shared";
import type { Deduction } from "@tax-platform/shared";

const EXEMPTION_TYPES = new Set([
  "health",
  "disability",
  "dependent",
  "education",
  "other_exemption"
]);

const ELIGIBLE_DEDUCTION_TYPES = new Set([
  "dependent",
  "medical",
  "education",
  "pension",
  "social_security",
  "professional",
  "other"
]);

/** Validate deduction eligibility by type. */
export function validateDeduction(d: Deduction): { ok: boolean; errors: string[]; isEligible: boolean } {
  const errors: string[] = [];
  if (d.amount < 0) errors.push("Amount cannot be negative.");
  if (d.requiresProof && !d.proofDocumentUrl) errors.push("Proof required but not provided.");
  const typeKey = d.deductionType.toLowerCase().replace(/\s+/g, "_");
  const isEligible = ELIGIBLE_DEDUCTION_TYPES.has(typeKey) || typeKey.startsWith("custom_");
  if (!isEligible) {
    errors.push(`Deduction type "${d.deductionType}" is not in the eligible catalog; marked for review.`);
  }
  return { ok: errors.length === 0, errors, isEligible };
}

/** @deprecated Use validateDeduction */
export function validateDeductionForMvp(d: Deduction): { ok: boolean; errors: string[] } {
  const v = validateDeduction(d);
  return { ok: v.ok, errors: v.errors };
}

export function sumExemptionsForScope(
  exemptions: Exemption[],
  scope: "monthly" | "annual",
  currency: "BRL" | "USD" = "BRL"
): number {
  return exemptions
    .filter((e) => e.applicationScope === scope)
    .reduce((s, e) => {
      if (currency === "BRL") return s + (e.amountBrl ?? (e.currency === "BRL" ? e.amount : 0));
      return s + (e.currency === "USD" ? e.amount : 0);
    }, 0);
}

export function sumDeductionsForScope(
  deductions: Deduction[],
  scope: "monthly" | "annual" | "transaction",
  currency: "BRL" | "USD" = "BRL"
): number {
  return deductions
    .filter((d) => d.applicationScope === scope)
    .reduce((s, d) => {
      if (currency === "BRL") return s + (d.amountBrl ?? (d.currency === "BRL" ? d.amount : 0));
      return s + (d.currency === "USD" ? d.amount : 0);
    }, 0);
}

export function isExemptionType(type: string): boolean {
  return EXEMPTION_TYPES.has(type.toLowerCase().replace(/\s+/g, "_"));
}
