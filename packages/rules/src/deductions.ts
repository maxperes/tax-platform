import type { Deduction } from "@tax-platform/shared";

export function validateDeductionForMvp(d: Deduction): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (d.amount < 0) errors.push("Amount cannot be negative.");
  if (d.requiresProof && !d.proofDocumentUrl) errors.push("Proof required but not provided.");
  return { ok: errors.length === 0, errors };
}
