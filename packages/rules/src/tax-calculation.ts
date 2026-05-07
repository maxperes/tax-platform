import type { TaxCalculationInput } from "@tax-platform/shared";
import { buildBrAnnualEstimate } from "./engines/br.js";

/** RF-005 annual estimate — BR progressive IRPF (see `engines/br`). `appliedRate` is ignored (legacy API). */
export function buildAnnualTaxEstimate(input: {
  taxYear: number;
  grossIncome: number;
  deductionsTotal: number;
  exemptionsTotal: number;
  foreignTaxPaid?: number;
  appliedRate?: number;
  requiresAdditionalReview: boolean;
}): TaxCalculationInput {
  void input.appliedRate;
  return buildBrAnnualEstimate({
    taxYear: input.taxYear,
    grossIncomeBrl: input.grossIncome,
    deductionsTotalBrl: input.deductionsTotal,
    exemptionsTotalBrl: input.exemptionsTotal,
    foreignTaxPaidBrl: input.foreignTaxPaid,
    requiresAdditionalReview: input.requiresAdditionalReview
  });
}
