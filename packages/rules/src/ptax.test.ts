import { describe, expect, it } from "vitest";
import { lookupPtaxToBrl, lookupPtaxToUsd, monthKeyFromDate } from "./ptax.js";
import { resolveBrlFromIncome, resolveUsdFromIncome } from "./fx.js";

describe("PTAX lookup", () => {
  it("returns monthly USD/BRL rate by payment date", () => {
    expect(monthKeyFromDate("2026-03-15")).toBe("2026-03");
    expect(lookupPtaxToBrl("USD", "2026-03-15")).toBe(5.35);
    expect(lookupPtaxToBrl("BRL", "2026-03-15")).toBe(1);
  });

  it("cross-converts EUR to USD via BRL", () => {
    const eurBrl = lookupPtaxToBrl("EUR", "2026-06-01");
    const eurUsd = lookupPtaxToUsd("EUR", "2026-06-01");
    const usdBrl = lookupPtaxToBrl("USD", "2026-06-01");
    expect(eurUsd).toBeCloseTo(eurBrl! / usdBrl!, 6);
  });

  it("auto-fills BRL from income when PTAX available", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 1000,
      originalCurrency: "USD",
      paymentDate: "2026-03-15"
    });
    expect(fx.amountBrl).toBeCloseTo(5350, 2);
    expect(fx.requiresAdditionalReview).toBe(false);
    expect(fx.notes).toMatch(/PTAX/);
  });

  it("auto-fills USD from BRL income via PTAX", () => {
    const fx = resolveUsdFromIncome({
      grossAmount: 5350,
      originalCurrency: "BRL",
      paymentDate: "2026-03-15"
    });
    expect(fx.amountUsd).toBeCloseTo(1000, 2);
    expect(fx.requiresAdditionalReview).toBe(false);
  });
});
