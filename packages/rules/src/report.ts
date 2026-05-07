import { buildRuleVersionStamp, DATA_PACK_BR_2026, DATA_PACK_US_2026 } from "@tax-platform/shared";
import type { TaxReportInput } from "@tax-platform/shared";

/** RF-012: build JSON summary for export. */
export function buildTaxReportSummary(input: {
  taxYear: number;
  fiscalProfile: string;
  incomes: unknown[];
  events: unknown[];
  deductions: unknown[];
  monthly: unknown[];
  capitalGains: unknown[];
  /** Latest per-jurisdiction annual estimate rows (serialized), if any. */
  annualTaxEstimates?: unknown[];
  requiresAdditionalReview: boolean;
  /** When dual jurisdictions, pass combined stamp; else defaults from fiscal profile heuristics. */
  ruleVersion?: string;
}): TaxReportInput {
  const ruleVersion =
    input.ruleVersion ??
    (input.fiscalProfile === "resident_usa"
      ? buildRuleVersionStamp(DATA_PACK_US_2026)
      : input.fiscalProfile === "dual_residence"
        ? `${buildRuleVersionStamp(DATA_PACK_BR_2026)}+${buildRuleVersionStamp(DATA_PACK_US_2026)}`
        : buildRuleVersionStamp(DATA_PACK_BR_2026));
  return {
    taxYear: input.taxYear,
    title: `Tax report ${input.taxYear}`,
    summaryJson: {
      fiscalProfile: input.fiscalProfile,
      incomes: input.incomes,
      taxableEvents: input.events,
      deductions: input.deductions,
      monthlyCarnetLeao: input.monthly,
      capitalGains: input.capitalGains,
      annualTaxEstimates: input.annualTaxEstimates ?? [],
      estimatesDisclaimer:
        "Annual tax figures are engine estimates from current inputs; they are not filing results or legal advice.",
      generatedAt: new Date().toISOString()
    },
    requiresAdditionalReview: input.requiresAdditionalReview,
    ruleVersion
  };
}
