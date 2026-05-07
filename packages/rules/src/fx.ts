/**
 * Deterministic FX helpers. When rates are missing, callers must flag review
 * instead of silently assuming 1:1 (see resolveBrlFromIncome).
 */

export type FxResolution = {
  amountBrl: number;
  exchangeRate: number;
  requiresAdditionalReview: boolean;
  notes?: string;
};

/**
 * BR Carnê-Leão / IRPF: prefer explicit grossAmountBrl; else grossAmount * exchangeRateToBrl.
 * If original currency is BRL and no rate, use 1. If foreign currency without rate, require review.
 */
export function resolveBrlFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  grossAmountBrl?: number;
  exchangeRateToBrl?: number;
}): FxResolution {
  if (input.grossAmountBrl !== undefined && input.grossAmountBrl >= 0) {
    const rate =
      input.exchangeRateToBrl ??
      (input.originalCurrency === "BRL" ? 1 : input.grossAmount > 0 ? input.grossAmountBrl / input.grossAmount : 1);
    return { amountBrl: input.grossAmountBrl, exchangeRate: rate, requiresAdditionalReview: false };
  }
  if (input.originalCurrency === "BRL") {
    return { amountBrl: input.grossAmount, exchangeRate: 1, requiresAdditionalReview: false };
  }
  if (input.exchangeRateToBrl !== undefined && input.exchangeRateToBrl > 0) {
    return {
      amountBrl: input.grossAmount * input.exchangeRateToBrl,
      exchangeRate: input.exchangeRateToBrl,
      requiresAdditionalReview: false
    };
  }
  return {
    amountBrl: input.grossAmount,
    exchangeRate: 1,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToBrl or grossAmountBrl for non-BRL income; using 1:1 placeholder pending FX feed."
  };
}

/** US side: convert to USD using stored rate if any; otherwise flag review (no silent guess). */
export function resolveUsdFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  amountUsd?: number;
  exchangeRateToUsd?: number;
}): { amountUsd: number; exchangeRate: number; requiresAdditionalReview: boolean; notes?: string } {
  if (input.amountUsd !== undefined && input.amountUsd >= 0) {
    const rate =
      input.exchangeRateToUsd ??
      (input.originalCurrency === "USD" ? 1 : input.grossAmount > 0 ? input.amountUsd / input.grossAmount : 1);
    return { amountUsd: input.amountUsd, exchangeRate: rate, requiresAdditionalReview: false };
  }
  if (input.originalCurrency === "USD") {
    return { amountUsd: input.grossAmount, exchangeRate: 1, requiresAdditionalReview: false };
  }
  if (input.exchangeRateToUsd !== undefined && input.exchangeRateToUsd > 0) {
    return {
      amountUsd: input.grossAmount * input.exchangeRateToUsd,
      exchangeRate: input.exchangeRateToUsd,
      requiresAdditionalReview: false
    };
  }
  return {
    amountUsd: input.grossAmount,
    exchangeRate: 1,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToUsd or amountUsd for non-USD income; using 1:1 placeholder."
  };
}
