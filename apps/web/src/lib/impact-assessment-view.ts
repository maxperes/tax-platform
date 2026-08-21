export type PlanningScenarioView = {
  id: string;
  label: string;
  description: string;
  estimatedBrTaxDelta: number;
  notes?: string[];
  proOnly?: boolean;
};

export type ObligationView = {
  code: string;
  label: string;
  required: boolean;
  reason?: string;
  probe?: boolean;
};

export type DeclarationView = {
  code: string;
  label: string;
  required: boolean;
  reason?: string;
};

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Headline tax used as the planning baseline (net when present, else gross). */
export function baselineHeadlineTax(toBe?: {
  brazilianTaxTotal?: number;
  estimatedBrGrossTaxTotal?: number;
}): number {
  const brazilian = toBe?.brazilianTaxTotal ?? 0;
  return brazilian > 0 ? brazilian : (toBe?.estimatedBrGrossTaxTotal ?? 0);
}

/**
 * Planning stores absolute tax on date scenarios and a true delta on sell-before.
 */
export function scenarioTaxAndDelta(
  scenario: PlanningScenarioView,
  baselineTax: number
): { tax: number; delta: number } {
  if (scenario.id === "sell-before") {
    const delta = scenario.estimatedBrTaxDelta;
    return { tax: roundMoney(baselineTax + delta), delta };
  }
  const tax = scenario.estimatedBrTaxDelta;
  return { tax, delta: roundMoney(tax - baselineTax) };
}

export function obligationBadge(item: ObligationView): {
  label: string;
  tone: "warning" | "info" | "neutral";
} {
  if (item.probe && item.required) return { label: "Simplified probe", tone: "info" };
  if (item.probe && !item.required) return { label: "Below probe", tone: "neutral" };
  if (item.required) return { label: "Likely required", tone: "warning" };
  return { label: "Not indicated", tone: "neutral" };
}

export function hypothesisDateFromIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}
