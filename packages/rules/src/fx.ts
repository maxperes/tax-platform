/**
 * Deterministic FX helpers. When rates are missing, converted amounts are 0
 * and callers must flag review — never treat the original number as 1:1.
 */

import { lookupPtaxToBrl, lookupPtaxToUsd } from "./ptax.js";

export type FxResolution = {
  amountBrl: number;
  exchangeRate: number;
  requiresAdditionalReview: boolean;
  notes?: string;
};

export type UsdFxResolution = {
  amountUsd: number;
  exchangeRate: number;
  requiresAdditionalReview: boolean;
  notes?: string;
};

export function normalizeFxCurrency(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * BR Carnê-Leão / IRPF: prefer explicit grossAmountBrl; else grossAmount * exchangeRateToBrl.
 * Falls back to PTAX by paymentDate when available (USD/EUR).
 */
export function resolveBrlFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  grossAmountBrl?: number;
  exchangeRateToBrl?: number;
  paymentDate?: string;
}): FxResolution {
  const currency = normalizeFxCurrency(input.originalCurrency);
  if (input.grossAmountBrl !== undefined && input.grossAmountBrl >= 0) {
    const rate =
      input.exchangeRateToBrl ??
      (currency === "BRL" ? 1 : input.grossAmount > 0 ? input.grossAmountBrl / input.grossAmount : 1);
    return { amountBrl: input.grossAmountBrl, exchangeRate: rate, requiresAdditionalReview: false };
  }
  if (currency === "BRL") {
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
    const ptax = lookupPtaxToBrl(currency, input.paymentDate);
    if (ptax !== undefined) {
      return {
        amountBrl: input.grossAmount * ptax,
        exchangeRate: ptax,
        requiresAdditionalReview: false,
        notes: `PTAX ${currency}/BRL for ${input.paymentDate.slice(0, 7)}`
      };
    }
  }
  return {
    amountBrl: 0,
    exchangeRate: 0,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToBrl or grossAmountBrl for non-BRL income; converted amount excluded from the tax base until FX is provided."
  };
}

/** US side: stored USD, PTAX, or BRL amount crossed through PTAX BRL/USD. */
export function resolveUsdFromIncome(input: {
  grossAmount: number;
  originalCurrency: string;
  amountUsd?: number;
  exchangeRateToUsd?: number;
  paymentDate?: string;
  grossAmountBrl?: number;
  exchangeRateToBrl?: number;
}): UsdFxResolution {
  const currency = normalizeFxCurrency(input.originalCurrency);
  if (input.amountUsd !== undefined && input.amountUsd >= 0) {
    const rate =
      input.exchangeRateToUsd ??
      (currency === "USD" ? 1 : input.grossAmount > 0 ? input.amountUsd / input.grossAmount : 1);
    return { amountUsd: input.amountUsd, exchangeRate: rate, requiresAdditionalReview: false };
  }
  if (currency === "USD") {
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
    const ptax = lookupPtaxToUsd(currency, input.paymentDate);
    if (ptax !== undefined) {
      return {
        amountUsd: input.grossAmount * ptax,
        exchangeRate: ptax,
        requiresAdditionalReview: false,
        notes: `PTAX ${currency}/USD for ${input.paymentDate.slice(0, 7)}`
      };
    }
  }
  const amountBrl =
    input.grossAmountBrl !== undefined && input.grossAmountBrl >= 0
      ? input.grossAmountBrl
      : input.exchangeRateToBrl !== undefined && input.exchangeRateToBrl > 0
        ? input.grossAmount * input.exchangeRateToBrl
        : undefined;
  if (amountBrl !== undefined && input.paymentDate) {
    const brlToUsd = lookupPtaxToUsd("BRL", input.paymentDate);
    if (brlToUsd !== undefined) {
      return {
        amountUsd: amountBrl * brlToUsd,
        exchangeRate: brlToUsd,
        requiresAdditionalReview: false,
        notes: `Via BRL then PTAX BRL/USD for ${input.paymentDate.slice(0, 7)}`
      };
    }
  }
  return {
    amountUsd: 0,
    exchangeRate: 0,
    requiresAdditionalReview: true,
    notes: "Missing exchangeRateToUsd or amountUsd for non-USD income; converted amount excluded from the tax base until FX is provided."
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
    const cur = normalizeFxCurrency(currency);
    if (cur === target) return amount;
    if (explicitRate !== undefined && explicitRate > 0) return amount * explicitRate;
    if (date) {
      const ptax =
        target === "BRL" ? lookupPtaxToBrl(cur, date) : lookupPtaxToUsd(cur, date);
      if (ptax !== undefined) return amount * ptax;
    }
    requiresReview = true;
    return 0;
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
