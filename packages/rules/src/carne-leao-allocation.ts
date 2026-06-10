import type { Deduction, Exemption } from "@tax-platform/shared";

export type CarnetLineDraft = {
  incomeSourceId?: string;
  paymentDate: string;
  amountBrl: number;
};

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function taxPeriodMatchesMonth(taxPeriod: string, monthKeyStr: string): boolean {
  return taxPeriod.startsWith(monthKeyStr) || taxPeriod.includes(monthKeyStr);
}

function amountBrl(amount: number, currency: string, amountBrlField?: number): number {
  if (amountBrlField !== undefined) return amountBrlField;
  if (currency === "BRL") return amount;
  return 0;
}

export type LineOffsets = { deduction: number; exemption: number };

/** Allocate monthly deductions/exemptions by payment month and optional relatedIncomeId. */
export function allocateMonthlyOffsets(
  lines: CarnetLineDraft[],
  deductions: Deduction[],
  exemptions: Exemption[]
): Map<string, LineOffsets> {
  const offsets = new Map<string, LineOffsets>();
  for (const line of lines) {
    const key = line.incomeSourceId ?? line.paymentDate;
    offsets.set(key, { deduction: 0, exemption: 0 });
  }

  const byMonth = new Map<string, CarnetLineDraft[]>();
  for (const line of lines) {
    const mk = monthKey(line.paymentDate);
    const list = byMonth.get(mk) ?? [];
    list.push(line);
    byMonth.set(mk, list);
  }

  for (const d of deductions.filter((x) => x.applicationScope === "monthly")) {
    const brl = amountBrl(d.amount, d.currency, d.amountBrl);
    if (d.relatedIncomeId && offsets.has(d.relatedIncomeId)) {
      offsets.get(d.relatedIncomeId)!.deduction += brl;
      continue;
    }
    for (const [mk, group] of byMonth) {
      if (!taxPeriodMatchesMonth(d.taxPeriod, mk)) continue;
      const share = group.length > 0 ? brl / group.length : 0;
      for (const line of group) {
        const key = line.incomeSourceId ?? line.paymentDate;
        offsets.get(key)!.deduction += share;
      }
    }
  }

  for (const e of exemptions.filter((x) => x.applicationScope === "monthly")) {
    const brl = amountBrl(e.amount, e.currency, e.amountBrl);
    for (const [mk, group] of byMonth) {
      if (!taxPeriodMatchesMonth(e.taxPeriod, mk)) continue;
      const share = group.length > 0 ? brl / group.length : 0;
      for (const line of group) {
        const key = line.incomeSourceId ?? line.paymentDate;
        offsets.get(key)!.exemption += share;
      }
    }
  }

  return offsets;
}
