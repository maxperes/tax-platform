import { describe, expect, it } from "vitest";
import { buildTaxReportSummary } from "./report.js";
import { ENGINE_VERSION, DATA_PACK_BR_2026 } from "@tax-platform/shared";

describe("buildTaxReportSummary", () => {
  it("builds a report with annual estimates and custom rule version", () => {
    const customStamp = `engine@${ENGINE_VERSION}+data@${DATA_PACK_BR_2026}+overrides@abc123`;
    const summary = buildTaxReportSummary({
      taxYear: 2026,
      fiscalProfile: "resident_brazil",
      incomes: [{ payerName: "Acme" }],
      events: [],
      deductions: [],
      monthly: [],
      capitalGains: [],
      annualTaxEstimates: [{ jurisdiction: "BR", netTaxDue: 0 }],
      requiresAdditionalReview: false,
      ruleVersion: customStamp
    });

    expect(summary.title).toBe("Tax report 2026");
    expect(summary.ruleVersion).toBe(customStamp);
    expect(summary.summaryJson.annualTaxEstimates).toHaveLength(1);
    expect(summary.summaryJson.estimatesDisclaimer).toMatch(/not filing results/);
  });

  it("mentions unconverted amounts when estimates are preliminary", () => {
    const summary = buildTaxReportSummary({
      taxYear: 2026,
      fiscalProfile: "dual_residence",
      incomes: [],
      events: [],
      deductions: [],
      monthly: [],
      capitalGains: [],
      annualTaxEstimates: [{ jurisdiction: "US", calculationStatus: "preliminary" }],
      requiresAdditionalReview: true
    });
    expect(summary.summaryJson.estimatesDisclaimer).toMatch(/could not be converted/);
  });
});
