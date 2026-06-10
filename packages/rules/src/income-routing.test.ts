import { describe, expect, it } from "vitest";
import {
  includesInOrdinaryAnnual,
  isCarnetLeaoLine,
  isExcludedFromOrdinaryAnnual,
  isLei14754Eligible
} from "./income-routing.js";

describe("income routing by calculationModule", () => {
  it("excludes carnet_leao from ordinary annual bucket", () => {
    expect(isExcludedFromOrdinaryAnnual({ calculationModule: "carnet_leao" })).toBe(true);
    expect(includesInOrdinaryAnnual({ calculationModule: "carnet_leao" })).toBe(false);
  });

  it("excludes capital_gain and trust_offshore from ordinary annual", () => {
    expect(isExcludedFromOrdinaryAnnual({ calculationModule: "capital_gain" })).toBe(true);
    expect(isExcludedFromOrdinaryAnnual({ calculationModule: "trust_offshore" })).toBe(true);
  });

  it("includes domestic irpf in ordinary annual", () => {
    expect(includesInOrdinaryAnnual({ calculationModule: "irpf", taxTreatment: "taxable" })).toBe(true);
  });

  it("excludes exempt and complex treatment", () => {
    expect(isExcludedFromOrdinaryAnnual({ taxTreatment: "exempt" })).toBe(true);
    expect(isExcludedFromOrdinaryAnnual({ taxTreatment: "complex" })).toBe(true);
  });

  it("identifies carnet and lei14754 flags", () => {
    expect(isCarnetLeaoLine({ calculationModule: "carnet_leao" })).toBe(true);
    expect(isLei14754Eligible({ lei14754ForeignProfitsEligible: true })).toBe(true);
  });
});
