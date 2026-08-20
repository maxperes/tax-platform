/**
 * Documented PTAX proxy — not a live BACEN feed.
 *
 * Statutory conversion for foreign-source IRPF / carnê-leão (IN SRF 208/2002 style):
 * USD→BRL at the BACEN buy PTAX for the last business day of the first fortnight
 * of the month BEFORE the availability/receipt month. This module approximates
 * that with a monthly-average series keyed by that prior month.
 *
 * Series: working CY2026 estimates carried from 2025 BACEN PTAX monthly averages
 * (USD/BRL and EUR/BRL venda), rounded to 2 decimals. Replace with a PTAX800
 * (or equivalent) feed before production.
 *
 * @see https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes
 */

export const PTAX_PROXY_META = {
  source: "https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes",
  methodology:
    "Monthly-average BACEN PTAX venda, applied to the calendar month before availability (statutory prior-fortnight proxy).",
  statutoryRule: "IN SRF 208/2002 — last business day of the first fortnight of the prior month",
  liveFeed: false,
  notes: "Hardcoded working series until a BACEN PTAX800 integration is wired."
} as const;

/** Key: YYYY-MM of the statutory (prior) month → BRL per 1 USD */
export const PTAX_USD_BRL_MONTHLY: Record<string, number> = {
  "2025-12": 5.4,
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

/** EUR/BRL monthly average proxy, same statutory month key. */
export const PTAX_EUR_BRL_MONTHLY: Record<string, number> = {
  "2025-12": 5.84,
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

/** Calendar month before `isoDate` (YYYY-MM), used as the IN SRF 208/2002 proxy key. */
export function statutoryPtaxMonthKey(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  if (!year || !month) return monthKeyFromDate(isoDate);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** Lookup PTAX BRL rate for 1 unit of foreign currency using the statutory prior-month key. */
export function lookupPtaxToBrl(currency: string, paymentDate: string): number | undefined {
  const cur = currency.toUpperCase();
  if (cur === "BRL") return 1;
  const key = statutoryPtaxMonthKey(paymentDate);
  if (cur === "USD") return PTAX_USD_BRL_MONTHLY[key];
  if (cur === "EUR") return PTAX_EUR_BRL_MONTHLY[key];
  return undefined;
}

/** Lookup PTAX USD rate for 1 unit of foreign currency (via BRL cross). */
export function lookupPtaxToUsd(currency: string, paymentDate: string): number | undefined {
  const cur = currency.toUpperCase();
  if (cur === "USD") return 1;
  const usdBrl = lookupPtaxToBrl("USD", paymentDate);
  if (!usdBrl) return undefined;
  if (cur === "BRL") return 1 / usdBrl;
  const toBrl = lookupPtaxToBrl(cur, paymentDate);
  if (toBrl === undefined) return undefined;
  return toBrl / usdBrl;
}
