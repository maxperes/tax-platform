import { getToken } from "../api";

export type FullTaxReport = {
  id: string;
  taxYear: number;
  title: string;
  createdAt: string;
  requiresAdditionalReview: boolean;
  isStale?: boolean;
  ruleVersion?: string;
  sections?: Array<{ title: string; bodyMarkdown?: string | null; items?: Array<{ label: string; valueJson: unknown }> }>;
  summaryJson: {
    fiscalProfile?: string;
    annualTaxEstimates?: Array<{
      jurisdiction?: string;
      currency?: string;
      grossIncome?: number;
      taxableBase?: number;
      netTaxDue?: number;
      calculationStatus?: string;
    }>;
    monthlyCarnetLeao?: Array<{
      taxMonth?: string;
      taxableBase?: number | string;
      netTaxDue?: number | string;
      calculationStatus?: string;
    }>;
    capitalGains?: Array<{ assetType?: string; gainAmount?: number | string; taxEstimate?: number | string }>;
    estimatesDisclaimer?: string;
  };
};

export function taxReportQueryKey(reportId: string) {
  return ["taxReportFull", reportId] as const;
}

export async function fetchTaxReport(reportId: string): Promise<FullTaxReport> {
  const token = getToken();
  const res = await fetch(`/api/report/${reportId}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error("Report not found");
  return (await res.json()) as FullTaxReport;
}
