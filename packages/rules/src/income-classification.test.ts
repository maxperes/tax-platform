import { describe, expect, it } from "vitest";
import { classifyIncome } from "./income-classification.js";

const baseIncome = {
  payerName: "Acme Corp",
  originCountry: "US",
  incomeType: "salary",
  grossAmount: 5000,
  originalCurrency: "USD",
  paymentDate: "2026-01-15",
  periodicity: "monthly" as const,
  nature: "work" as const
};

describe("classifyIncome", () => {
  it("routes foreign income for Brazil resident to carnet_leao", () => {
    const result = classifyIncome(baseIncome, "resident_brazil");
    expect(result.classification.calculationModule).toBe("carnet_leao");
    expect(result.classification.origin).toBe("foreign");
  });

  it("flags trust-like income as complex", () => {
    const result = classifyIncome(
      { ...baseIncome, nature: "trust", incomeType: "distribution" },
      "resident_brazil"
    );
    expect(result.classification.calculationModule).toBe("trust_offshore");
    expect(result.classification.taxTreatment).toBe("complex");
  });

  it("assigns FTC basket for US resident passive income", () => {
    const result = classifyIncome(
      { ...baseIncome, incomeType: "dividend", nature: "investment" },
      "resident_usa"
    );
    expect(result.classification.ftcBasket).toBe("passive");
  });

  it("routes dual-residence foreign salary to carnet_leao with a US FTC basket", () => {
    const result = classifyIncome(baseIncome, "dual_residence");
    expect(result.classification.calculationModule).toBe("carnet_leao");
    expect(result.classification.origin).toBe("foreign");
    expect(result.classification.ftcBasket).toBe("general");
  });

  it("keeps dual-residence Brazil-source salary on IRPF with a US FTC basket", () => {
    const result = classifyIncome({ ...baseIncome, originCountry: "BR", originalCurrency: "BRL" }, "dual_residence");
    expect(result.classification.calculationModule).toBe("irpf");
    expect(result.classification.origin).toBe("brazil");
    expect(result.classification.ftcBasket).toBe("general");
  });
});
