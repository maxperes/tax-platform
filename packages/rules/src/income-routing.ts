/** Classification fields used to route income into calculation modules. */
export type IncomeClassificationLike = {
  calculationModule?: string;
  taxTreatment?: string;
  lei14754ForeignProfitsEligible?: boolean;
  ftcBasket?: "passive" | "general";
};

/** Income excluded from ordinary annual progressive buckets (handled elsewhere or not auto-taxed). */
export function isExcludedFromOrdinaryAnnual(
  classification: IncomeClassificationLike | null | undefined
): boolean {
  const module = classification?.calculationModule;
  const treatment = classification?.taxTreatment;
  if (treatment === "exempt" || treatment === "non_taxable" || treatment === "complex") return true;
  if (module === "carnet_leao" || module === "capital_gain" || module === "trust_offshore") return true;
  if (module === "asset_simulation" || module === "entity_simulation") return true;
  return false;
}

export function includesInOrdinaryAnnual(classification: IncomeClassificationLike | null | undefined): boolean {
  return !isExcludedFromOrdinaryAnnual(classification);
}

/**
 * US Form 1040 ordinary income: carnet_leao lines are still worldwide US income.
 * Brazil annual IRPF keeps using includesInOrdinaryAnnual (excludes carnet_leao).
 */
export function includesInUsOrdinaryAnnual(
  classification: IncomeClassificationLike | null | undefined
): boolean {
  const treatment = classification?.taxTreatment;
  if (treatment === "exempt" || treatment === "non_taxable" || treatment === "complex") return false;
  const module = classification?.calculationModule;
  if (module === "capital_gain" || module === "trust_offshore") return false;
  if (module === "asset_simulation" || module === "entity_simulation") return false;
  return true;
}

export function isCarnetLeaoLine(classification: IncomeClassificationLike | null | undefined): boolean {
  return classification?.calculationModule === "carnet_leao";
}

export function isLei14754Eligible(classification: IncomeClassificationLike | null | undefined): boolean {
  return classification?.lei14754ForeignProfitsEligible === true;
}
