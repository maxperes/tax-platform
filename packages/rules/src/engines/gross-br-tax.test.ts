import { describe, expect, it } from "vitest";
import { taxFromProgressiveTable } from "../progressive.js";
import { brRulePack2026 } from "../data/br/2026.js";
import { computeAggregatedGrossBrTax } from "./gross-br-tax.js";

describe("aggregated gross BR tax", () => {
  it("applies the annual table once to the stacked BRL base", () => {
    const stacked = taxFromProgressiveTable(40_000, brRulePack2026.annual);
    const perLine =
      taxFromProgressiveTable(20_000, brRulePack2026.annual) +
      taxFromProgressiveTable(20_000, brRulePack2026.annual);
    expect(perLine).not.toBeCloseTo(stacked, 2);

    const result = computeAggregatedGrossBrTax({
      amountBrlByLine: [20_000, 20_000],
      regimeByLine: ["irpf_progressive", "irpf_progressive"],
      pack: brRulePack2026
    });
    expect(result.total).toBeCloseTo(stacked, 2);
    expect(result.taxByLine[0]! + result.taxByLine[1]!).toBeCloseTo(stacked, 2);
  });

  it("keeps GCAP and Lei 14.754 off the progressive table", () => {
    const result = computeAggregatedGrossBrTax({
      amountBrlByLine: [10_000, 10_000],
      regimeByLine: ["gcap", "lei_14754"],
      pack: brRulePack2026
    });
    expect(result.irpfTax).toBe(0);
    expect(result.leiTax).toBeCloseTo(10_000 * brRulePack2026.lei14754Rate, 2);
    expect(result.gcapTax).toBeGreaterThan(0);
  });
});
