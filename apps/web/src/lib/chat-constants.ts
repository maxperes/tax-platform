export const STEP_ORDER = [
  { id: "fiscal_residence", label: "Fiscal profile" },
  { id: "income_capture", label: "Income" },
  { id: "events", label: "Derived events" },
  { id: "capital_gain", label: "Capital gains" },
  { id: "patrimony", label: "Patrimony" },
  { id: "transfers", label: "Transfers" },
  { id: "trust_registry", label: "Trusts" },
  { id: "entity_simulation", label: "PF vs PJ" },
  { id: "deductions", label: "Deductions" },
  { id: "monthly_calc", label: "Monthly tax" },
  { id: "report", label: "Report" },
  { id: "complete", label: "Done" }
] as const;

export const WHY_HINT_BY_STATE: Record<string, string> = {
  fiscal_residence: "Why this matters: this determines your residency tax rules and filing scope.",
  income_capture: "Why this matters: income details drive taxable events and monthly tax estimates.",
  events: "Why this matters: we confirm how your income is classified before continuing.",
  deductions: "Why this matters: eligible deductions can reduce your taxable base.",
  capital_gain: "Why this matters: selling stocks, a home, or crypto is taxed differently from salary. Say none if you did not sell anything.",
  patrimony: "Why this matters: listing what you own helps with wealth reporting. You can skip this.",
  transfers: "Why this matters: moving money to your own account is usually not extra tax.",
  trust_registry: "Why this matters: a trust can change who is taxed. Say none if you do not have one.",
  entity_simulation: "Why this matters: optional comparison of individual vs company tax. Skip if it does not apply.",
  monthly_calc: "Why this matters: month-by-month Brazilian tax estimates on foreign income, when they apply.",
  report: "Why this matters: we assemble a complete summary for review and export.",
  complete: "Your intake is complete. You can now review or export your summary."
};

export const INCOME_QUICK_ADDS = [
  {
    label: "Salary template",
    text: "Salary from US employer, paid monthly, 5000 USD, payment date 2026-01-31."
  },
  {
    label: "Dividend template",
    text: "Dividend from US broker, 350 USD, payment date 2026-02-15."
  },
  {
    label: "Freelance template",
    text: "Freelance income from Brazil client, 8000 BRL, payment date 2026-03-10."
  }
] as const;

export const TRIAGE_OPTIONS = [
  { id: "foreign_salary", label: "Foreign salary or freelance" },
  { id: "investments", label: "Dividends, interest, investments" },
  { id: "asset_sale", label: "Asset sale or capital gain" },
  { id: "full_annual", label: "Full annual tax picture" }
] as const;

export const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  annual: "Annual",
  one_off: "One-time",
  recurring: "Recurring"
};

export const CALC_STATUS_LABELS: Record<string, string> = {
  ok: "Complete",
  preliminary: "Preliminary",
  requires_review: "Needs review"
};

export function stepLabelForState(state: string): string {
  return STEP_ORDER.find((s) => s.id === state)?.label ?? state.replace(/_/g, " ");
}

export function stepProgress(state: string): { index: number; total: number } {
  const idx = STEP_ORDER.findIndex((s) => s.id === state);
  return { index: Math.max(0, idx) + 1, total: STEP_ORDER.length };
}

export function formatCalcStatus(status: string | undefined): string {
  if (!status) return "—";
  return CALC_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
