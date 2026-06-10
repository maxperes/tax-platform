import { describe, expect, it } from "vitest";
import { taxFromProgressiveTable } from "../progressive.js";
import { BR_IRPF_MONTHLY_2026, BR_IRPF_ANNUAL_2026, brRulePack2026 } from "./br/2026.js";
import { US_BRACKETS_SINGLE, usRulePack2026 } from "./us/2026.js";
import { computeCarneLeaoLineTax, graduatedCapitalGainTax } from "../engines/br.js";
import { computeUsFederalTax2 } from "../engines/us.js";

/**
 * Golden values sourced from published tables — re-validate with tax SME each year.
 * BR monthly: RFB tabela progressiva mensal (2024-style embedded in br-2026-1).
 * US single brackets: IRS inflation adjustments (2025-style embedded in us-2026-1).
 */
describe("golden statutory fixtures (SME-reviewed snapshots)", () => {
  it("BR monthly: R$ 2,259.20 is zero bracket", () => {
    expect(taxFromProgressiveTable(2259.2, BR_IRPF_MONTHLY_2026)).toBe(0);
  });

  it("BR monthly: R$ 3,500.00 matches progressive formula", () => {
    const expected = 3500 * 0.15 - 381.44;
    expect(taxFromProgressiveTable(3500, BR_IRPF_MONTHLY_2026)).toBeCloseTo(expected, 2);
    expect(computeCarneLeaoLineTax(3500, brRulePack2026)).toBeCloseTo(expected, 2);
  });

  it("BR annual: R$ 28,559.70 is zero bracket", () => {
    expect(taxFromProgressiveTable(28559.7, BR_IRPF_ANNUAL_2026)).toBe(0);
  });

  it("BR capital gain: R$ 2M uses 15% + 17.5% slices", () => {
    const { tax } = graduatedCapitalGainTax(2_000_000, brRulePack2026);
    expect(tax).toBeCloseTo(1_000_000 * 0.15 + 1_000_000 * 0.175, 2);
  });

  it("US single: $60,000 taxable income in 22% band", () => {
    const tax = computeUsFederalTax2(60_000, US_BRACKETS_SINGLE);
    expect(tax).toBeGreaterThan(6000);
    expect(tax).toBeLessThan(60_000 * 0.24);
  });

  it("US pack FEIE limit matches embedded constant", () => {
    expect(usRulePack2026.feieLimit).toBe(130_000);
  });
});
