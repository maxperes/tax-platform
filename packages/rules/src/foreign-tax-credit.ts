import { lookupPtaxToBrl, lookupPtaxToUsd } from "./ptax.js";

export function convertForeignTaxToBrl(
  amount: number,
  currency: string,
  paymentDate: string,
  exchangeRateToBrl?: number
): { amountBrl: number; requiresReview: boolean } {
  if (currency.toUpperCase() === "BRL") return { amountBrl: amount, requiresReview: false };
  if (exchangeRateToBrl !== undefined && exchangeRateToBrl > 0) {
    return { amountBrl: amount * exchangeRateToBrl, requiresReview: false };
  }
  const ptax = lookupPtaxToBrl(currency, paymentDate);
  if (ptax !== undefined) return { amountBrl: amount * ptax, requiresReview: false };
  return { amountBrl: 0, requiresReview: true };
}

export function convertForeignTaxToUsd(
  amount: number,
  currency: string,
  paymentDate: string,
  exchangeRateToUsd?: number
): { amountUsd: number; requiresReview: boolean } {
  if (currency.toUpperCase() === "USD") return { amountUsd: amount, requiresReview: false };
  if (exchangeRateToUsd !== undefined && exchangeRateToUsd > 0) {
    return { amountUsd: amount * exchangeRateToUsd, requiresReview: false };
  }
  const ptax = lookupPtaxToUsd(currency, paymentDate);
  if (ptax !== undefined) return { amountUsd: amount * ptax, requiresReview: false };
  return { amountUsd: 0, requiresReview: true };
}

/** Credit limited to tax attributable to the same income (simplified FTC). */
export function computeForeignTaxCredit(foreignTaxPaid: number, taxOnSameIncome: number): number {
  if (foreignTaxPaid <= 0 || taxOnSameIncome <= 0) return 0;
  return Math.min(foreignTaxPaid, taxOnSameIncome);
}

export type UsFtcBasketTotals = {
  passiveIncomeUsd: number;
  generalIncomeUsd: number;
  passiveForeignTaxUsd: number;
  generalForeignTaxUsd: number;
  passiveTaxUsd: number;
  generalTaxUsd: number;
  passiveCreditUsd: number;
  generalCreditUsd: number;
  totalCreditUsd: number;
};

/** Simplified Form 1116: credit per basket capped by tax in that basket. */
export function computeUsFtcByBasket(totals: {
  passiveIncomeUsd: number;
  generalIncomeUsd: number;
  passiveForeignTaxUsd: number;
  generalForeignTaxUsd: number;
  passiveTaxUsd: number;
  generalTaxUsd: number;
}): UsFtcBasketTotals {
  const passiveCreditUsd = computeForeignTaxCredit(totals.passiveForeignTaxUsd, totals.passiveTaxUsd);
  const generalCreditUsd = computeForeignTaxCredit(totals.generalForeignTaxUsd, totals.generalTaxUsd);
  return {
    ...totals,
    passiveCreditUsd,
    generalCreditUsd,
    totalCreditUsd: passiveCreditUsd + generalCreditUsd
  };
}
