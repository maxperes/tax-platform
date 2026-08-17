import { describe, expect, it } from "vitest";
import { resolveBrlFromIncome, resolveUsdFromIncome } from "./fx.js";

describe("resolveBrlFromIncome", () => {
  it("uses grossAmountBrl when provided", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 1000,
      originalCurrency: "USD",
      grossAmountBrl: 5000,
      exchangeRateToBrl: 5
    });
    expect(fx.amountBrl).toBe(5000);
    expect(fx.requiresAdditionalReview).toBe(false);
  });

  it("flags review when foreign currency lacks FX and no payment date", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 1000,
      originalCurrency: "USD"
    });
    expect(fx.requiresAdditionalReview).toBe(true);
    expect(fx.amountBrl).toBe(0);
    expect(fx.notes).toMatch(/Missing exchangeRateToBrl/);
  });

  it("uses PTAX when payment date provided", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 100,
      originalCurrency: "USD",
      paymentDate: "2026-01-10"
    });
    expect(fx.requiresAdditionalReview).toBe(false);
    expect(fx.amountBrl).toBeGreaterThan(500);
  });

  it("uses 1:1 for BRL without extra fields", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 1200,
      originalCurrency: "BRL"
    });
    expect(fx.amountBrl).toBe(1200);
    expect(fx.exchangeRate).toBe(1);
    expect(fx.requiresAdditionalReview).toBe(false);
  });

  it("does not copy PEN (or other non-PTAX currencies) 1:1 into BRL", () => {
    const fx = resolveBrlFromIncome({
      grossAmount: 10900,
      originalCurrency: "PEN",
      paymentDate: "2026-01-31"
    });
    expect(fx.amountBrl).toBe(0);
    expect(fx.requiresAdditionalReview).toBe(true);
  });

});

describe("resolveUsdFromIncome", () => {
  it("flags review when non-USD lacks conversion", () => {
    const fx = resolveUsdFromIncome({
      grossAmount: 2000,
      originalCurrency: "BRL"
    });
    expect(fx.requiresAdditionalReview).toBe(true);
    expect(fx.amountUsd).toBe(0);
  });

  it("passes through USD amounts", () => {
    const fx = resolveUsdFromIncome({
      grossAmount: 3000,
      originalCurrency: "usd"
    });
    expect(fx.amountUsd).toBe(3000);
    expect(fx.requiresAdditionalReview).toBe(false);
  });

  it("crosses a BRL rate into USD via PTAX", () => {
    const fx = resolveUsdFromIncome({
      grossAmount: 10900,
      originalCurrency: "PEN",
      exchangeRateToBrl: 1.55,
      paymentDate: "2026-01-31"
    });
    expect(fx.requiresAdditionalReview).toBe(false);
    expect(fx.amountUsd).toBeGreaterThan(0);
    expect(fx.notes).toMatch(/Via BRL/);
  });
});
