import { describe, expect, it } from "vitest";
import { taxFromProgressiveTable } from "../progressive.js";
import { BR_IRPF_MONTHLY_2026, BR_IRPF_ANNUAL_2026, brRulePack2026 } from "./br/2026.js";
import { US_BRACKETS_SINGLE, usRulePack2026 } from "./us/2026.js";
import { computeCarneLeaoLineTax, graduatedCapitalGainTax } from "../engines/br.js";
import { computeUsFederalTax2 } from "../engines/us.js";
import { BR_IRPF_MENSAL_2025_05 } from "../legal/matriz/tables/br-irpf-mensal-2025-05.js";

/**
 * Golden values sourced from the single matriz vigência table.
 * BR monthly: BR-IRPF-MENSAL-2025-05 (also the 2026 data pack).
 * US single brackets: IRS inflation adjustments (2025-style embedded in us-2026-1).
 */
describe("golden statutory fixtures (SME-reviewed snapshots)", () => {
  it("BR monthly pack is the matriz vigência table", () => {
    expect(BR_IRPF_MONTHLY_2026).toEqual(BR_IRPF_MENSAL_2025_05);
    expect(brRulePack2026.monthly).toBe(BR_IRPF_MONTHLY_2026);
  });

  it("BR monthly: first-band ceiling is zero tax", () => {
    expect(taxFromProgressiveTable(2428.8, BR_IRPF_MONTHLY_2026)).toBe(0);
  });

  it("BR monthly: R$ 3,500.00 matches progressive formula", () => {
    const expected = 3500 * 0.15 - 394.16;
    expect(taxFromProgressiveTable(3500, BR_IRPF_MONTHLY_2026)).toBeCloseTo(expected, 2);
    expect(computeCarneLeaoLineTax(3500, brRulePack2026)).toBeCloseTo(expected, 2);
  });

  it("BR annual bands are monthly × 12", () => {
    expect(BR_IRPF_ANNUAL_2026[0]?.upperBound).toBeCloseTo(2428.8 * 12, 2);
    expect(taxFromProgressiveTable(BR_IRPF_ANNUAL_2026[0]!.upperBound, BR_IRPF_ANNUAL_2026)).toBe(0);
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
