import { describe, expect, it } from "vitest";
import { taxFromProgressiveTable } from "../../progressive.js";
import { BR_IRPF_MONTHLY_2026, brRulePack2026 } from "../../data/br/2026.js";
import {
  buildBrAnnualEstimate,
  computeCarneLeaoLineTax,
  computeCapitalGainBr,
  graduatedCapitalGainTax
} from "../br.js";
import { buildUsAnnualEstimate, computeUsFederalTax2 } from "../us.js";
import { US_BRACKETS_SINGLE, usRulePack2026 } from "../../data/us/2026.js";

/**
 * BR monthly table source (RFB tabela progressiva mensal, 2024-style used in data pack until CY2026 published):
 * @see https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda
 */
describe("BR 2026 data pack", () => {
  it("applies monthly progressive tax on a mid-bracket base", () => {
    const tax = taxFromProgressiveTable(3500, BR_IRPF_MONTHLY_2026);
    expect(tax).toBeGreaterThan(0);
    expect(tax).toBeLessThan(3500 * 0.275);
  });

  it("computes Carnê-Leão line tax via engine", () => {
    const t = computeCarneLeaoLineTax(3500, brRulePack2026);
    expect(t).toBe(taxFromProgressiveTable(3500, BR_IRPF_MONTHLY_2026));
  });

  it("builds annual BR estimate with credit cap", () => {
    const est = buildBrAnnualEstimate({
      taxYear: 2026,
      grossIncomeBrl: 100_000,
      deductionsTotalBrl: 10_000,
      exemptionsTotalBrl: 0,
      foreignTaxPaidBrl: 50_000,
      requiresAdditionalReview: false,
      pack: brRulePack2026
    });
    expect(est.currency).toBe("BRL");
    expect(est.taxCreditApplied).toBeLessThanOrEqual(est.grossTax);
    expect(est.netTaxDue).toBeGreaterThanOrEqual(0);
  });

  it("applies graduated capital gain slices", () => {
    const { tax } = graduatedCapitalGainTax(2_000_000, brRulePack2026);
    const simple = 1_000_000 * 0.15 + 1_000_000 * 0.175;
    expect(tax).toBeCloseTo(simple, 4);
  });

  it("computes capital gain BR result shape", () => {
    const r = computeCapitalGainBr({
      assetType: "stock",
      assetCountry: "BR",
      acquisitionDate: "2020-01-01",
      acquisitionValue: 1000,
      acquisitionCurrency: "BRL",
      saleDate: "2026-06-01",
      saleValue: 2000,
      saleCurrency: "BRL",
      ownershipPercentageSold: 100,
      deductibleExpenses: 0
    });
    expect(r.gain).toBe(1000);
    expect(r.taxEstimate).toBeGreaterThan(0);
  });
});

/**
 * US brackets based on IRS inflation adjustments (2025-style embedded as 2026 working pack).
 * @see https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2025
 */
describe("US 2026 data pack", () => {
  it("computes federal ordinary tax for taxable income in 22% band", () => {
    const tax = computeUsFederalTax2(60_000, US_BRACKETS_SINGLE);
    expect(tax).toBeGreaterThan(5000);
    expect(tax).toBeLessThan(15_000);
  });

  it("builds US annual estimate with standard deduction", () => {
    const est = buildUsAnnualEstimate({
      taxYear: 2026,
      grossIncomeUsd: 120_000,
      deductionsUsd: 0,
      exemptionsUsd: 0,
      foreignTaxPaidUsd: 5000,
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 10_000,
      filingStatus: "single",
      requiresAdditionalReview: false,
      pack: usRulePack2026
    });
    expect(est.currency).toBe("USD");
    expect(est.jurisdiction).toBe("US");
    expect(est.netTaxDue).toBeGreaterThan(0);
  });
});
