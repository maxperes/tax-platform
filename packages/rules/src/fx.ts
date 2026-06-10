/**
 * Deterministic FX helpers. When rates are missing, callers must flag review
 * instead of silently assuming 1:1 (see resolveBrlFromIncome).
 */

import { lookupPtaxToBrl, lookupPtaxToUsd } from "./ptax.js";

export type FxResolution = {
  amountBrl: number;
  exchangeRate: number;
  requiresAdditionalReview: boolean;
  notes?: string;
};

/**
 * BR Carnê-Leão / IRPF: prefer explicit grossAmountBrl; else grossAmount * exchangeRateToBrl.
 * Falls back to PTAX by paymentDate when available.
 */
export function resolveBrlFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  grossAmountBrl?: number;
  exchangeRateToBrl?: number;
  paymentDate?: string;
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
  if (input.paymentDate) {
    const ptax = lookupPtaxToBrl(input.originalCurrency, input.paymentDate);
    if (ptax !== undefined) {
      return {
        amountBrl: input.grossAmount * ptax,
        exchangeRate: ptax,
        requiresAdditionalReview: false,
        notes: `PTAX ${input.originalCurrency}/BRL for ${input.paymentDate.slice(0, 7)}`
      };
    }
  }
  return {
    amountBrl: input.grossAmount,
    exchangeRate: 1,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToBrl or grossAmountBrl for non-BRL income; using 1:1 placeholder pending FX feed."
  };
}

/** US side: convert to USD using stored rate, PTAX, or flag review. */
export function resolveUsdFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  amountUsd?: number;
  exchangeRateToUsd?: number;
  paymentDate?: string;
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
  if (input.paymentDate) {
    const ptax = lookupPtaxToUsd(input.originalCurrency, input.paymentDate);
    if (ptax !== undefined) {
      return {
        amountUsd: input.grossAmount * ptax,
        exchangeRate: ptax,
        requiresAdditionalReview: false,
        notes: `PTAX ${input.originalCurrency}/USD for ${input.paymentDate.slice(0, 7)}`
      };
    }
  }
  return {
    amountUsd: input.grossAmount,
    exchangeRate: 1,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToUsd or amountUsd for non-USD income; using 1:1 placeholder."
  };
}

/** Normalize capital-gain amounts to a target currency using optional explicit rates. */
export function normalizeCapitalGainAmounts(input: {
  acquisitionValue: number;
  acquisitionCurrency: string;
  saleValue: number;
  saleCurrency: string;
  targetCurrency: "BRL" | "USD";
  exchangeRateAcquisition?: number;
  exchangeRateSale?: number;
  acquisitionDate?: string;
  saleDate?: string;
}): {
  acquisitionValue: number;
  saleValue: number;
  requiresReview: boolean;
} {
  const target = input.targetCurrency;
  let requiresReview = false;

  const toTarget = (amount: number, currency: string, explicitRate: number | undefined, date?: string): number => {
    if (currency.toUpperCase() === target) return amount;
    if (explicitRate !== undefined && explicitRate > 0) return amount * explicitRate;
    if (date) {
      const ptax =
        target === "BRL"
          ? lookupPtaxToBrl(currency, date)
          : lookupPtaxToUsd(currency, date);
      if (ptax !== undefined) return amount * ptax;
    }
    requiresReview = true;
    return amount;
  };

  return {
    acquisitionValue: toTarget(
      input.acquisitionValue,
      input.acquisitionCurrency,
      input.exchangeRateAcquisition,
      input.acquisitionDate
    ),
    saleValue: toTarget(input.saleValue, input.saleCurrency, input.exchangeRateSale, input.saleDate),
    requiresReview
  };
}
