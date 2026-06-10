import { describe, expect, it } from "vitest";
import { classifyIncome } from "./income-classification.js";
import { includesInOrdinaryAnnual } from "./income-routing.js";
import { resolveBrlFromIncome } from "./fx.js";
import { buildBrAnnualEstimate } from "./engines/br.js";
import { brRulePack2026 } from "./data/br/2026.js";

/** SME-style fixture: BR resident with foreign salary (carnet) + domestic salary (irpf). */
describe("golden: foreign salary routing", () => {
  it("excludes carnet_leao from annual progressive while including domestic irpf", () => {
    const foreign = classifyIncome(
      {
        payerName: "US Corp",
        originCountry: "US",
        incomeType: "salary",
        grossAmount: 5000,
        originalCurrency: "USD",
        paymentDate: "2026-03-01",
        periodicity: "monthly",
        nature: "work"
      },
      "resident_brazil"
    );
    const domestic = classifyIncome(
      {
        payerName: "BR Employer",
        originCountry: "BR",
        incomeType: "salary",
        grossAmount: 120_000,
        originalCurrency: "BRL",
        paymentDate: "2026-12-01",
        periodicity: "annual",
        nature: "work"
      },
      "resident_brazil"
    );

    expect(foreign.classification.calculationModule).toBe("carnet_leao");
    expect(domestic.classification.calculationModule).toBe("irpf");
    expect(includesInOrdinaryAnnual(foreign.classification)).toBe(false);
    expect(includesInOrdinaryAnnual(domestic.classification)).toBe(true);

    const fx = resolveBrlFromIncome({
      grossAmount: foreign.grossAmount,
      originalCurrency: foreign.originalCurrency,
      paymentDate: foreign.paymentDate
    });
    const annualOnly = buildBrAnnualEstimate({
      taxYear: 2026,
      grossIncomeBrl: domestic.grossAmount,
      deductionsTotalBrl: 0,
      exemptionsTotalBrl: 0,
      requiresAdditionalReview: false,
      pack: brRulePack2026
    });
    const doubleCount = buildBrAnnualEstimate({
      taxYear: 2026,
      grossIncomeBrl: domestic.grossAmount + fx.amountBrl,
      deductionsTotalBrl: 0,
      exemptionsTotalBrl: 0,
      requiresAdditionalReview: false,
      pack: brRulePack2026
    });

    expect(doubleCount.grossTax).toBeGreaterThan(annualOnly.grossTax);
  });
});
