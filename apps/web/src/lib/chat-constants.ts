export const STEP_ORDER = [
  { id: "fiscal_residence", label: "Profile" },
  { id: "income_capture", label: "Income" },
  { id: "events", label: "Assets" },
  { id: "report", label: "Tax map" },
  { id: "complete", label: "Done" }
] as const;

export const FILING_STEP_ORDER = [
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
  fiscal_residence: "Why this matters: citizenship, Brazil stays and filing history decide the residency map — the same facts as the interview.",
  income_capture: "Why this matters: annual income by category is what the impact engine taxes after date D.",
  events: "Why this matters: we confirm income categories and asset locations before building the tax map.",
  deductions: "Why this matters: eligible deductions can reduce your taxable base.",
  capital_gain: "Why this matters: selling stocks, a home, or crypto is taxed differently from salary. Say none if you did not sell anything.",
  patrimony: "Why this matters: listing what you own helps with wealth reporting. You can skip this.",
  transfers: "Why this matters: moving money to your own account is usually not extra tax.",
  trust_registry: "Why this matters: a trust can change who is taxed. Say none if you do not have one.",
  entity_simulation: "Why this matters: optional comparison of individual vs company tax. Skip if it does not apply.",
  monthly_calc: "Why this matters: month-by-month Brazilian tax estimates on foreign income, when they apply.",
  report: "Why this matters: we save the same 360° tax map as the structured interview.",
  complete: "Your map intake is complete. Open View map for the preliminary impact report."
};

export const INCOME_QUICK_ADDS = [
  {
    label: "US salary (annual)",
    text: "US salary about 100000 USD a year, tax withheld 20000."
  },
  {
    label: "Social Security",
    text: "US Social Security about 18000 USD a year."
  },
  {
    label: "Dividends",
    text: "US dividends about 5000 USD a year, tax withheld 750."
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

export function stepLabelForState(state: string, filingPath = false): string {
  const order = filingPath ? FILING_STEP_ORDER : STEP_ORDER;
  return order.find((s) => s.id === state)?.label ?? state.replace(/_/g, " ");
}

export function stepProgress(state: string, filingPath = false): { index: number; total: number } {
  const order = filingPath ? FILING_STEP_ORDER : STEP_ORDER;
  const idx = order.findIndex((s) => s.id === state);
  if (idx < 0 && FILING_STEP_ORDER.some((s) => s.id === state)) {
    return stepProgress(state, true);
  }
  return { index: Math.max(0, idx) + 1, total: order.length };
}

export function formatCalcStatus(status: string | undefined): string {
  if (!status) return "—";
  return CALC_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
