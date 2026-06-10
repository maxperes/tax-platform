import { buildRuleVersionStamp, type MonthlyTaxCalculationItem } from "@tax-platform/shared";
import { BR_DATA_PACK_ID, brRulePack2026, type BrRulePack2026 } from "./data/br/2026.js";
import { computeCarneLeaoMonthlyAggregate } from "./engines/br.js";
import { effectiveRate } from "./progressive.js";
import { computeForeignTaxCredit, convertForeignTaxToBrl } from "./foreign-tax-credit.js";

export type CarnetLeaoItem = MonthlyTaxCalculationItem & { lei14754Eligible?: boolean };

export interface MonthlyAggregate {
  month: number;
  year: number;
  taxableBaseBrl: number;
  grossTax: number;
  foreignTaxCreditApplied: number;
  netTaxDue: number;
  rate: number;
  items: MonthlyTaxCalculationItem[];
  ruleVersion: string;
  requiresAdditionalReview: boolean;
}

function proRataAllocate(total: number, bases: number[]): number[] {
  const sum = bases.reduce((s, b) => s + b, 0);
  if (sum <= 0 || total <= 0) return bases.map(() => 0);
  return bases.map((b) => (b / sum) * total);
}

/** RF-017: tax on monthly aggregate base; Lei 14.754 lines at flat rate; pro-rata line allocation. */
export function aggregateMonthlyCarnetLeao(
  items: CarnetLeaoItem[],
  options?: { ruleVersion?: string; pack?: BrRulePack2026 }
): MonthlyAggregate[] {
  const pack = options?.pack ?? brRulePack2026;
  const ruleVersion = options?.ruleVersion ?? buildRuleVersionStamp(BR_DATA_PACK_ID);
  const byKey = new Map<string, CarnetLeaoItem[]>();
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
    const leiLines = list.filter((i) => i.lei14754Eligible);
    const progLines = list.filter((i) => !i.lei14754Eligible);
    const leiBase = leiLines.reduce((s, i) => s + i.taxableAmount, 0);
    const progBase = progLines.reduce((s, i) => s + i.taxableAmount, 0);
    const taxableBaseBrl = leiBase + progBase;
    const leiTax = leiBase * pack.lei14754Rate;
    const { grossTax: progTax } = computeCarneLeaoMonthlyAggregate(pack, progBase);
    const grossTax = leiTax + progTax;
    const leiAlloc = proRataAllocate(
      leiTax,
      leiLines.map((l) => l.taxableAmount)
    );
    const progAlloc = proRataAllocate(
      progTax,
      progLines.map((l) => l.taxableAmount)
    );
    let leiIdx = 0;
    let progIdx = 0;
    const allocatedItems: MonthlyTaxCalculationItem[] = list.map((it) => {
      const calculatedTax = it.lei14754Eligible ? leiAlloc[leiIdx++]! : progAlloc[progIdx++]!;
      return { ...it, calculatedTax };
    });
    let foreignTaxCreditApplied = 0;
    let requiresAdditionalReview = list.some((i) => i.requiresReview);
    for (const it of allocatedItems) {
      if (!it.foreignTaxPaid || it.foreignTaxPaid <= 0) continue;
      const converted = convertForeignTaxToBrl(
        it.foreignTaxPaid,
        it.originalCurrency,
        it.paymentDate,
        it.exchangeRate
      );
      requiresAdditionalReview ||= converted.requiresReview;
      const credit = computeForeignTaxCredit(converted.amountBrl, it.calculatedTax);
      if (converted.amountBrl > it.calculatedTax) requiresAdditionalReview = true;
      foreignTaxCreditApplied += credit;
    }
    const netTaxDue = Math.max(0, grossTax - foreignTaxCreditApplied);
    const rate = taxableBaseBrl > 0 ? effectiveRate(grossTax, taxableBaseBrl) : 0;
    result.push({
      month: m,
      year: y,
      taxableBaseBrl,
      grossTax,
      foreignTaxCreditApplied,
      netTaxDue,
      rate,
      items: allocatedItems,
      ruleVersion,
      requiresAdditionalReview
    });
  }
  return result.sort((a, b) => a.year - b.year || a.month - b.month);
}
