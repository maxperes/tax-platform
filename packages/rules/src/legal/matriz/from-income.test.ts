import { describe, expect, it } from "vitest";
import { applyBrIrpfExt001 } from "./br-irpf-ext-001.js";
import {
  classifiedIncomeToIrpfExtItem,
  computeMonthlyViaIrpfExt001,
  naturezaFromIncomeLabels
} from "./from-income.js";
import { brRulePack2026 } from "../../data/br/2026.js";

describe("classified income → BR-IRPF-EXT-001", () => {
  it("maps consulting/work to trabalho", () => {
    expect(naturezaFromIncomeLabels("consulting", "work")).toBe("trabalho");
    expect(naturezaFromIncomeLabels("US Social Security", "pension")).toBe("aposentadoria");
  });

  it("pipeline monthly tax matches applyBrIrpfExt001 for RFB Q140 FX facts", () => {
    const itens = [
      classifiedIncomeToIrpfExtItem({
        id: "de-salary",
        originCountry: "DE",
        incomeType: "salary",
        nature: "work",
        originalCurrency: "USD",
        grossAmount: 10_000,
        paymentDate: "2023-06-17",
        taxPaidOriginCountry: 1_000,
        exchangeRateToBrl: 5.2695
      })
    ];
    const direct = applyBrIrpfExt001({
      dataInicioResidenciaBr: "2020-01-01",
      itens
    });
    const via = computeMonthlyViaIrpfExt001({
      residencyStart: "2020-01-01",
      itens,
      lei14754Items: [],
      pack: brRulePack2026,
      ruleVersion: "test",
      sourceItems: [
        {
          incomeSourceId: "de-salary",
          incomeType: "salary",
          originCountry: "DE",
          paymentDate: "2023-06-17",
          originalAmount: 10_000,
          originalCurrency: "USD",
          exchangeRate: 5.2695,
          amountBrl: 52_695,
          foreignTaxPaid: 1_000,
          taxableAmount: 52_695,
          calculatedTax: 0
        }
      ]
    });
    expect(via).toHaveLength(1);
    expect(via[0]!.grossTax).toBe(direct.months[0]!.imposto_apurado_brl);
    expect(via[0]!.netTaxDue).toBe(direct.months[0]!.imposto_a_recolher_brl);
    expect(via[0]!.foreignTaxCreditApplied).toBe(direct.months[0]!.credito_exterior_aplicado_brl);
  });
});
