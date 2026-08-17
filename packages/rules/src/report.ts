import { buildRuleVersionStamp, DATA_PACK_BR_2026, DATA_PACK_US_2026 } from "@tax-platform/shared";
import type { TaxReportInput } from "@tax-platform/shared";

export type ReportSectionDef = {
  title: string;
  bodyMarkdown?: string;
  payload?: Record<string, unknown>;
  sortOrder: number;
  items?: { label: string; valueJson: unknown }[];
};

/** RF-012: build JSON summary and structured sections for export. */
export function buildTaxReportSummary(input: {
  taxYear: number;
  fiscalProfile: string;
  incomes: unknown[];
  events: unknown[];
  deductions: unknown[];
  exemptions?: unknown[];
  monthly: unknown[];
  capitalGains: unknown[];
  assets?: unknown[];
  transfers?: unknown[];
  trusts?: unknown[];
  entitySimulations?: unknown[];
  annualTaxEstimates?: unknown[];
  unconvertedIncome?: { amount: number; currency: string; payerName: string }[];
  requiresAdditionalReview: boolean;
  ruleVersion?: string;
}): TaxReportInput & { sections: ReportSectionDef[] } {
  const ruleVersion =
    input.ruleVersion ??
    (input.fiscalProfile === "resident_usa"
      ? buildRuleVersionStamp(DATA_PACK_US_2026)
      : input.fiscalProfile === "dual_residence"
        ? `${buildRuleVersionStamp(DATA_PACK_BR_2026)}+${buildRuleVersionStamp(DATA_PACK_US_2026)}`
        : buildRuleVersionStamp(DATA_PACK_BR_2026));

  const estimates = (input.annualTaxEstimates ?? []) as {
    calculationStatus?: string;
    requiresAdditionalReview?: boolean;
  }[];
  const preliminaryEstimates = estimates.some(
    (e) => e.calculationStatus === "preliminary" || e.requiresAdditionalReview === true
  );
  const estimatesDisclaimer = [
    "Annual tax figures are engine estimates from current inputs; they are not filing results or legal advice. Rates validated for calendar year 2026.",
    preliminaryEstimates || input.requiresAdditionalReview
      ? "Preliminary rows exclude amounts that could not be converted (missing exchange rate). Dual residence is always flagged for specialist review."
      : null
  ]
    .filter(Boolean)
    .join(" ");

  const summaryJson = {
    fiscalProfile: input.fiscalProfile,
    incomes: input.incomes,
    taxableEvents: input.events,
    deductions: input.deductions,
    exemptions: input.exemptions ?? [],
    monthlyCarnetLeao: input.monthly,
    capitalGains: input.capitalGains,
    assets: input.assets ?? [],
    internationalTransfers: input.transfers ?? [],
    trustStructures: input.trusts ?? [],
    entitySimulations: input.entitySimulations ?? [],
    annualTaxEstimates: input.annualTaxEstimates ?? [],
    unconvertedIncome: input.unconvertedIncome ?? [],
    estimatesDisclaimer,
    generatedAt: new Date().toISOString()
  };

  const sections: ReportSectionDef[] = [
    {
      title: "Fiscal profile",
      sortOrder: 0,
      payload: { fiscalProfile: input.fiscalProfile },
      items: [{ label: "Profile", valueJson: input.fiscalProfile }]
    },
    {
      title: "Income sources",
      sortOrder: 1,
      bodyMarkdown: `${(input.incomes as unknown[]).length} income line(s) on file.`,
      payload: { count: (input.incomes as unknown[]).length },
      items: (input.incomes as { payerName?: string; grossAmount?: unknown; originalCurrency?: string }[])
        .slice(0, 20)
        .map((i) => ({
          label: i.payerName ?? "Income",
          valueJson: { amount: i.grossAmount, currency: i.originalCurrency }
        }))
    },
    {
      title: "Taxable events",
      sortOrder: 2,
      bodyMarkdown: `${(input.events as unknown[]).length} derived event(s).`,
      payload: { events: input.events }
    },
    {
      title: "Monthly Carnê-Leão",
      sortOrder: 3,
      payload: { monthly: input.monthly },
      items: (input.monthly as { taxMonth?: number; netTaxDue?: unknown; taxableBase?: unknown }[]).map((m) => ({
        label: `Month ${m.taxMonth}`,
        valueJson: { taxableBase: m.taxableBase, netTaxDue: m.netTaxDue }
      }))
    },
    {
      title: "Annual estimates",
      sortOrder: 4,
      payload: { estimates: input.annualTaxEstimates },
      items: (
        (input.annualTaxEstimates ?? []) as { jurisdiction?: string; netTaxDue?: unknown; currency?: string }[]
      ).map((e) => ({
        label: e.jurisdiction ?? "Estimate",
        valueJson: { netTaxDue: e.netTaxDue, currency: e.currency }
      }))
    },
    {
      title: "Capital gains",
      sortOrder: 5,
      payload: { capitalGains: input.capitalGains }
    },
    {
      title: "Deductions and exemptions",
      sortOrder: 6,
      payload: { deductions: input.deductions, exemptions: input.exemptions ?? [] }
    },
    {
      title: "Patrimony (assets)",
      sortOrder: 7,
      payload: { assets: input.assets ?? [] }
    },
    {
      title: "International transfers",
      sortOrder: 8,
      payload: { transfers: input.transfers ?? [] }
    },
    {
      title: "Trust structures",
      sortOrder: 9,
      payload: { trusts: input.trusts ?? [] }
    },
    {
      title: "PF vs PJ simulation",
      sortOrder: 10,
      payload: { entitySimulations: input.entitySimulations ?? [] }
    }
  ];

  if (input.requiresAdditionalReview) {
    sections.push({
      title: "Review flags",
      sortOrder: 99,
      bodyMarkdown: "This case requires additional expert review before relying on any figures.",
      payload: { requiresAdditionalReview: true }
    });
  }

  return {
    taxYear: input.taxYear,
    title: `Tax report ${input.taxYear}`,
    summaryJson,
    requiresAdditionalReview: input.requiresAdditionalReview,
    ruleVersion,
    sections
  };
}
