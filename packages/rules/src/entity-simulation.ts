import { buildRuleVersionStamp } from "@tax-platform/shared";
import type { EntitySimulationInput } from "@tax-platform/shared";
import { DATA_PACK_BR_2026 } from "@tax-platform/shared";

export type EntitySimulationResult = {
  pfTaxEstimate: number;
  pjTaxEstimate: number;
  savingsEstimate: number;
  currency: string;
  requiresReview: boolean;
  ruleVersion: string;
  breakdown: {
    proLaboreTaxed: number;
    profitDistributed: number;
    entityTax: number;
  };
};

/** RF-013: simplified PF vs PJ comparison using estimated effective PJ rate. */
export function simulatePfVsPj(
  grossIncomeBrl: number,
  input: EntitySimulationInput
): EntitySimulationResult {
  const proLabore = grossIncomeBrl * (input.proLaborePercent / 100);
  const profitPool = Math.max(0, grossIncomeBrl - proLabore - input.estimatedOperatingCosts);
  const distributedProfit = profitPool * (input.profitDistributionPercent / 100);
  const entityTax = profitPool * input.estimatedEffectiveTaxRate;
  const proLaboreTaxed = proLabore * 0.275;
  const pjTaxEstimate = proLaboreTaxed + entityTax;
  const pfTaxEstimate = grossIncomeBrl * 0.275;
  const savingsEstimate = pfTaxEstimate - pjTaxEstimate;
  return {
    pfTaxEstimate,
    pjTaxEstimate,
    savingsEstimate,
    currency: "BRL",
    requiresReview: true,
    ruleVersion: buildRuleVersionStamp(DATA_PACK_BR_2026),
    breakdown: {
      proLaboreTaxed,
      profitDistributed: distributedProfit,
      entityTax
    }
  };
}
