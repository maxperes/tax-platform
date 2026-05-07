import type { IncomeSource } from "@tax-platform/shared";

export interface DetectedTaxableEvent {
  description: string;
  eventType: "income" | "capital_gain" | "asset" | "international" | "corporate" | "complex";
  isTaxable: boolean;
  requiresReview: boolean;
  incomeSourceId?: string;
}

/** RF-003: derive taxable events from incomes (simplified MVP). */
export function detectTaxableEventsFromIncomes(incomes: IncomeSource[]): DetectedTaxableEvent[] {
  const out: DetectedTaxableEvent[] = [];
  for (const inc of incomes) {
    const isForeign = inc.originCountry !== "BR";
    const trustLike = inc.nature === "trust" || inc.incomeType.toLowerCase().includes("trust");
    out.push({
      description: `Income from ${inc.payerName} (${inc.originCountry})`,
      eventType: trustLike ? "complex" : isForeign ? "international" : "income",
      isTaxable: inc.classification?.taxTreatment !== "non_taxable" && inc.classification?.taxTreatment !== "exempt",
      requiresReview: trustLike || inc.classification?.taxTreatment === "complex",
      incomeSourceId: undefined
    });
  }
  return out;
}
