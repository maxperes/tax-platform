import { describe, expect, it } from "vitest";
import { aggregateMonthlyCarnetLeao } from "./monthly-carne-leao.js";
import { brRulePack2026, BR_IRPF_MONTHLY_2026 } from "./data/br/2026.js";
import { taxFromProgressiveTable } from "./progressive.js";
import { computeCarneLeaoLineTax } from "./engines/br.js";

describe("Carnê-Leão monthly aggregate (golden)", () => {
  it("uses progressive tax on monthly total, not sum of per-line taxes", () => {
    const line1Base = 3500;
    const line2Base = 3500;
    const monthlyTotal = line1Base + line2Base;
    const perLineSum =
      taxFromProgressiveTable(line1Base, BR_IRPF_MONTHLY_2026) +
      taxFromProgressiveTable(line2Base, BR_IRPF_MONTHLY_2026);
    const progressiveOnTotal = taxFromProgressiveTable(monthlyTotal, BR_IRPF_MONTHLY_2026);

    expect(perLineSum).not.toBeCloseTo(progressiveOnTotal, 2);

    const agg = aggregateMonthlyCarnetLeao(
      [
        {
          incomeType: "salary",
          originCountry: "US",
          paymentDate: "2026-03-15",
          originalAmount: line1Base,
          originalCurrency: "BRL",
          exchangeRate: 1,
          amountBrl: line1Base,
          taxableAmount: line1Base,
          calculatedTax: 0
        },
        {
          incomeType: "consulting",
          originCountry: "US",
          paymentDate: "2026-03-20",
          originalAmount: line2Base,
          originalCurrency: "BRL",
          exchangeRate: 1,
          amountBrl: line2Base,
          taxableAmount: line2Base,
          calculatedTax: 0
        }
      ],
      { pack: brRulePack2026 }
    );

    expect(agg).toHaveLength(1);
    expect(agg[0]!.grossTax).toBeCloseTo(progressiveOnTotal, 4);
    expect(agg[0]!.grossTax).not.toBeCloseTo(perLineSum, 2);
    const allocatedSum = agg[0]!.items.reduce((s, i) => s + i.calculatedTax, 0);
    expect(allocatedSum).toBeCloseTo(progressiveOnTotal, 4);
  });

  it("applies Lei 14.754 flat rate to eligible dividend lines", () => {
    const dividendBase = 10_000;
    const salaryBase = 5000;
    const leiTax = dividendBase * brRulePack2026.lei14754Rate;
    const progTax = taxFromProgressiveTable(salaryBase, BR_IRPF_MONTHLY_2026);

    const agg = aggregateMonthlyCarnetLeao(
      [
        {
          incomeType: "dividend",
          originCountry: "US",
          paymentDate: "2026-04-01",
          originalAmount: dividendBase,
          originalCurrency: "BRL",
          exchangeRate: 1,
          amountBrl: dividendBase,
          taxableAmount: dividendBase,
          calculatedTax: 0,
          lei14754Eligible: true
        },
        {
          incomeType: "salary",
          originCountry: "US",
          paymentDate: "2026-04-15",
          originalAmount: salaryBase,
          originalCurrency: "BRL",
          exchangeRate: 1,
          amountBrl: salaryBase,
          taxableAmount: salaryBase,
          calculatedTax: 0
        }
      ],
      { pack: brRulePack2026 }
    );

    expect(agg[0]!.grossTax).toBeCloseTo(leiTax + progTax, 4);
    expect(computeCarneLeaoLineTax(dividendBase, brRulePack2026, true)).toBeCloseTo(leiTax, 4);
  });

  it("applies foreign tax credit against monthly net due", () => {
    const base = 5000;
    const grossTax = taxFromProgressiveTable(base, BR_IRPF_MONTHLY_2026);
    const foreignWithheld = grossTax * 0.5;

    const agg = aggregateMonthlyCarnetLeao(
      [
        {
          incomeType: "salary",
          originCountry: "US",
          paymentDate: "2026-05-01",
          originalAmount: base,
          originalCurrency: "BRL",
          exchangeRate: 1,
          amountBrl: base,
          foreignTaxPaid: foreignWithheld,
          taxableAmount: base,
          calculatedTax: 0
        }
      ],
      { pack: brRulePack2026 }
    );

    expect(agg[0]!.foreignTaxCreditApplied).toBeCloseTo(foreignWithheld, 4);
    expect(agg[0]!.netTaxDue).toBeCloseTo(grossTax - foreignWithheld, 4);
  });
});
