import { buildRuleVersionStamp, type MonthlyTaxCalculationItem } from "@tax-platform/shared";
import { BR_DATA_PACK_ID, brRulePack2026 } from "./data/br/2026.js";
import { computeCarneLeaoMonthlyAggregate } from "./engines/br.js";
import { effectiveRate } from "./progressive.js";

export interface MonthlyAggregate {
  month: number;
  year: number;
  taxableBaseBrl: number;
  grossTax: number;
  rate: number;
  items: MonthlyTaxCalculationItem[];
  ruleVersion: string;
  requiresAdditionalReview: boolean;
}

/** RF-017: group by month; sum per-line `calculatedTax`, then reconcile effective rate from monthly progressive on total base. */
export function aggregateMonthlyCarnetLeao(
  items: MonthlyTaxCalculationItem[],
  options?: { ruleVersion?: string }
): MonthlyAggregate[] {
  const ruleVersion = options?.ruleVersion ?? buildRuleVersionStamp(BR_DATA_PACK_ID);
  const byKey = new Map<string, MonthlyTaxCalculationItem[]>();
  for (const it of items) {
    const d = new Date(it.paymentDate + "T12:00:00Z");
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    const list = byKey.get(key) ?? [];
    list.push(it);
    byKey.set(key, list);
  }
  const result: MonthlyAggregate[] = [];
  for (const [key, list] of byKey) {
    const [y, m] = key.split("-").map(Number);
    const taxableBaseBrl = list.reduce((s, i) => s + i.taxableAmount, 0);
    const sumLineTax = list.reduce((s, i) => s + i.calculatedTax, 0);
    const requiresAdditionalReview = list.some((i) => i.requiresReview);
    const { grossTax: progressiveOnTotal, appliedRate: rateOnTotal } = computeCarneLeaoMonthlyAggregate(
      brRulePack2026,
      taxableBaseBrl
    );
    const grossTax = sumLineTax > 0 ? sumLineTax : progressiveOnTotal;
    const rate = taxableBaseBrl > 0 ? effectiveRate(grossTax, taxableBaseBrl) : rateOnTotal;
    result.push({
      month: m,
      year: y,
      taxableBaseBrl,
      grossTax,
      rate,
      items: list,
      ruleVersion,
      requiresAdditionalReview
    });
  }
  return result.sort((a, b) => a.year - b.year || a.month - b.month);
}
