/**
 * PTAX-style monthly USD/BRL reference rates (working 2026 estimates).
 * Replace with BACEN PTAX feed or SME-validated table for production.
 * Key: YYYY-MM -> BRL per 1 USD
 */
export const PTAX_USD_BRL_MONTHLY: Record<string, number> = {
  "2026-01": 5.42,
  "2026-02": 5.38,
  "2026-03": 5.35,
  "2026-04": 5.4,
  "2026-05": 5.45,
  "2026-06": 5.48,
  "2026-07": 5.5,
  "2026-08": 5.52,
  "2026-09": 5.49,
  "2026-10": 5.46,
  "2026-11": 5.44,
  "2026-12": 5.41
};

/** EUR/BRL monthly (estimate). */
export const PTAX_EUR_BRL_MONTHLY: Record<string, number> = {
  "2026-01": 5.85,
  "2026-02": 5.82,
  "2026-03": 5.78,
  "2026-04": 5.8,
  "2026-05": 5.83,
  "2026-06": 5.86,
  "2026-07": 5.88,
  "2026-08": 5.9,
  "2026-09": 5.87,
  "2026-10": 5.84,
  "2026-11": 5.82,
  "2026-12": 5.79
};

export function monthKeyFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Lookup PTAX BRL rate for 1 unit of foreign currency on payment date month. */
export function lookupPtaxToBrl(currency: string, paymentDate: string): number | undefined {
  const cur = currency.toUpperCase();
  if (cur === "BRL") return 1;
  const key = monthKeyFromDate(paymentDate);
  if (cur === "USD") return PTAX_USD_BRL_MONTHLY[key];
  if (cur === "EUR") return PTAX_EUR_BRL_MONTHLY[key];
  return undefined;
}

/** Lookup PTAX USD rate for 1 unit of foreign currency (via BRL cross). */
export function lookupPtaxToUsd(currency: string, paymentDate: string): number | undefined {
  const cur = currency.toUpperCase();
  if (cur === "USD") return 1;
  const key = monthKeyFromDate(paymentDate);
  const usdBrl = PTAX_USD_BRL_MONTHLY[key];
  if (!usdBrl) return undefined;
  if (cur === "BRL") return 1 / usdBrl;
  const toBrl = lookupPtaxToBrl(cur, paymentDate);
  if (toBrl === undefined) return undefined;
  return toBrl / usdBrl;
}
