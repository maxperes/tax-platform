/** One row of Brazilian IR-style progressive table: tax = base * rate - deduction (when base in row). */
export type ProgressiveRow = {
  upperBound: number;
  rate: number;
  deduction: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Annual IRPF bands from a monthly table (RFB annual = monthly × 12). */
export function annualizeMonthlyProgressiveTable(monthly: ProgressiveRow[]): ProgressiveRow[] {
  return monthly.map((row) => ({
    upperBound:
      row.upperBound === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : round2(row.upperBound * 12),
    rate: row.rate,
    deduction: round2(row.deduction * 12)
  }));
}

export function taxFromProgressiveTable(base: number, rows: ProgressiveRow[]): number {
  if (base <= 0) return 0;
  for (const row of rows) {
    if (base <= row.upperBound) {
      return Math.max(0, base * row.rate - row.deduction);
    }
  }
  const last = rows[rows.length - 1];
  if (!last) return 0;
  return Math.max(0, base * last.rate - last.deduction);
}

/** Effective average rate for display (grossTax / base), capped at top marginal. */
export function effectiveRate(grossTax: number, base: number): number {
  if (base <= 0) return 0;
  return grossTax / base;
}
