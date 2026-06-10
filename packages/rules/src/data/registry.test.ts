import { describe, expect, it } from "vitest";
import {
  getBrRulePackForYear,
  isTaxYearSupported,
  resolveBrDataPackId,
  resolvePackTaxYear,
  SUPPORTED_TAX_YEARS
} from "./registry.js";

describe("rule pack registry", () => {
  it("lists supported tax years", () => {
    expect(SUPPORTED_TAX_YEARS).toContain(2026);
  });

  it("resolves 2026 pack directly", () => {
    expect(isTaxYearSupported(2026)).toBe(true);
    expect(resolveBrDataPackId(2026)).toBe("br-2026-1");
    expect(getBrRulePackForYear(2026).dataPackId).toBe("br-2026-1");
  });

  it("falls back to nearest prior year when no dedicated pack exists", () => {
    expect(resolvePackTaxYear(2027)).toBe(2026);
    expect(resolveBrDataPackId(2027)).toBe("br-2026-1");
  });
});
