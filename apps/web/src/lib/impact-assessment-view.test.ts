import { describe, expect, it } from "vitest";
import {
  baselineHeadlineTax,
  obligationBadge,
  scenarioTaxAndDelta
} from "./impact-assessment-view";

describe("impact-assessment-view", () => {
  it("treats date scenarios as absolute tax and sell-before as a delta", () => {
    const baseline = 40_000;
    const january = scenarioTaxAndDelta(
      {
        id: "move-january",
        label: "January",
        description: "",
        estimatedBrTaxDelta: 48_000,
        notes: []
      },
      baseline
    );
    expect(january.tax).toBe(48_000);
    expect(january.delta).toBe(8_000);

    const sell = scenarioTaxAndDelta(
      {
        id: "sell-before",
        label: "Sell",
        description: "",
        estimatedBrTaxDelta: -5_000,
        notes: []
      },
      baseline
    );
    expect(sell.tax).toBe(35_000);
    expect(sell.delta).toBe(-5_000);
  });

  it("prefers Brazilian tax over gross for the baseline", () => {
    expect(baselineHeadlineTax({ brazilianTaxTotal: 10, estimatedBrGrossTaxTotal: 99 })).toBe(10);
    expect(baselineHeadlineTax({ brazilianTaxTotal: 0, estimatedBrGrossTaxTotal: 99 })).toBe(99);
  });

  it("labels probe obligations separately from likely filings", () => {
    expect(obligationBadge({ code: "CBE", label: "CBE", required: true, probe: true }).label).toBe(
      "Simplified probe"
    );
    expect(obligationBadge({ code: "IRPF", label: "IRPF", required: true }).label).toBe("Likely required");
    expect(obligationBadge({ code: "CBE", label: "CBE", required: false, probe: true }).label).toBe(
      "Below probe"
    );
  });
});
