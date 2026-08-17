import { describe, expect, it } from "vitest";
import {
  buildAsIsSnapshot,
  computeBrazilianResidencyStart,
  buildToBeImpact,
  buildPlanningResult,
  buildImpactAssessmentReport,
  getNormativeMonitorStatus,
  getBrLegalRules
} from "../src/index.js";

describe("Impact Assessment engines", () => {
  const inventory = {
    residency: {
      firstEntryBrazilDate: "2026-03-01",
      entryPathway: "permanent_visa" as const,
      currentlyFiscalResidentBrazil: false,
      currentlyFiscalResidentUSA: true
    },
    countryFootprint: [
      { country: "US", hasTaxResidency: true, hasCitizenship: true, hasGreenCard: false },
      { country: "BR", hasTaxResidency: false }
    ],
    incomes: [
      {
        category: "salary",
        originCountry: "US",
        currency: "USD",
        annualAmount: 100000,
        taxPaidOrigin: 20000
      },
      {
        category: "social_security",
        originCountry: "US",
        currency: "USD",
        annualAmount: 18000
      }
    ],
    assets: [{ name: "Home", assetType: "real_estate", country: "US", currentValue: 500000, currency: "USD" }],
    entities: [{ name: "Ops LLC", entityType: "llc", country: "US", ownershipPercent: 100, controls: true }],
    trusts: [],
    financialAccountsSummary: ["Schwab", "Chase"]
  };

  it("builds As Is without recommendations", () => {
    const snap = buildAsIsSnapshot({
      inventory,
      persons: [{ fullName: "Alex", role: "primary", livesInCountry: "US" }]
    });
    expect(snap.recommendations).toEqual([]);
    expect(snap.completionPercent).toBeGreaterThan(50);
    expect(snap.moduleCompletion.residency).toBe(true);
  });

  it("computes residency start for permanent visa", () => {
    const result = computeBrazilianResidencyStart(inventory.residency, "2026-06-01");
    expect(result.method).toBe("permanent_visa");
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-03-01");
    expect(result.lifecycleState).toBe("tax_resident");
    expect(result.reliability.certaintyTier).toBeTruthy();
  });

  it("builds To Be gross impact", () => {
    const toBe = buildToBeImpact({
      inventory: buildAsIsSnapshot({ inventory }).inventory,
      hypothesisResidencyDate: "2026-07-01",
      applyReliefs: false
    });
    expect(toBe.categoryImpacts.length).toBe(2);
    expect(toBe.estimatedBrGrossTaxTotal).toBeGreaterThan(0);
    expect(toBe.obligations.some((o) => o.code === "IRPF" && o.required)).toBe(true);
    expect(toBe.risks.some((r) => r.code === "llc_transparent")).toBe(true);
    expect(toBe.reliefsNote).toMatch(/Gross mode/i);
    expect(toBe.brazilianTaxTotal).toBeGreaterThanOrEqual(0);
    expect(toBe.situationSummary.requiredFilings.length).toBeGreaterThan(0);
    expect(toBe.categoryImpacts[0]?.explanation?.rule).toBeTruthy();
    expect(toBe.obligations.some((o) => o.code === "DARF")).toBe(true);
    expect(toBe.obligations.some((o) => o.code === "EXIT_DECLARATION")).toBe(true);
    expect(toBe.obligations.some((o) => o.code === "NO_FILING")).toBe(true);
  });

  it("gates planning scenarios for basic vs pro", () => {
    const toBe = buildToBeImpact({
      inventory: buildAsIsSnapshot({ inventory }).inventory,
      hypothesisResidencyDate: "2026-07-01"
    });
    const inv = buildAsIsSnapshot({ inventory }).inventory;
    const basic = buildPlanningResult({ inventory: inv, toBe, plan: "basic" });
    const pro = buildPlanningResult({ inventory: inv, toBe, plan: "pro" });
    expect(basic.proUnlocked).toBe(false);
    expect(pro.proUnlocked).toBe(true);
    expect(pro.scenarios.length).toBeGreaterThan(0);
  });

  it("builds four-section impact report", () => {
    const report = buildImpactAssessmentReport({
      inventory: buildAsIsSnapshot({ inventory }).inventory,
      persons: [{ fullName: "Alex", role: "primary" }],
      hypothesisResidencyDate: "2026-07-01",
      plan: "basic"
    });
    expect(report.sections).toHaveLength(4);
    expect(report.title).toMatch(/Impact Assessment/i);
    expect(report.legalRulePackId).toBeTruthy();
  });

  it("exposes legal rules and monitor scaffold", () => {
    expect(getBrLegalRules().length).toBeGreaterThan(5);
    const mon = getNormativeMonitorStatus();
    expect(mon.mode).toBe("scaffold");
    expect(mon.sources.length).toBeGreaterThan(3);
  });

  it("slices income by payment date vs residency start", () => {
    const toBe = buildToBeImpact({
      inventory: {
        ...inventory,
        residency: {
          firstEntryBrazilDate: "2026-07-01",
          entryPathway: "permanent_visa",
          currentlyFiscalResidentBrazil: false
        },
        incomes: [
          {
            category: "salary",
            originCountry: "US",
            currency: "USD",
            annualAmount: 40000,
            paymentDate: "2026-03-01",
            brazilianTaxTreatment: "salary_progressive"
          },
          {
            category: "salary",
            originCountry: "US",
            currency: "USD",
            annualAmount: 40000,
            paymentDate: "2026-08-01",
            brazilianTaxTreatment: "salary_progressive"
          }
        ]
      },
      hypothesisResidencyDate: "2026-07-01",
      applyReliefs: false
    });
    const before = toBe.categoryImpacts.find((row) => row.annualAmount === 40000 && row.inBrTaxBase === false);
    const after = toBe.categoryImpacts.find((row) => row.annualAmount === 40000 && row.inBrTaxBase === true);
    expect(before?.taxability).toBe("not_taxable_br");
    expect(before?.netPayable).toBe(0);
    expect(after?.inBrTaxBase).toBe(true);
    expect(toBe.estimatedBrGrossTaxTotal).toBeGreaterThan(0);
  });

  it("emits no-filing-required when residency and nexus are absent", () => {
    const toBe = buildToBeImpact({
      inventory: {
        residency: { entryPathway: "temporary_visa", currentlyFiscalResidentBrazil: false },
        countryFootprint: [{ country: "US", hasTaxResidency: true }],
        incomes: [],
        assets: [],
        entities: [],
        trusts: [],
        financialAccountsSummary: []
      },
      hypothesisResidencyDate: "2026-07-01"
    });
    expect(toBe.residency.lifecycleState).toBe("nonresident");
    expect(toBe.obligations.some((o) => o.code === "IRPF" && o.required)).toBe(false);
    expect(toBe.obligations.some((o) => o.code === "BENS_DIREITOS" && o.required)).toBe(false);
    expect(toBe.obligations.some((o) => o.code === "NO_FILING" && o.required)).toBe(true);
  });

  it("prefers structured Brazilian tax treatment over category heuristics", () => {
    const toBe = buildToBeImpact({
      inventory: {
        ...inventory,
        incomes: [
          {
            category: "salary",
            originCountry: "US",
            currency: "USD",
            annualAmount: 50000,
            brazilianTaxTreatment: "capital_gain"
          }
        ]
      },
      hypothesisResidencyDate: "2026-07-01"
    });
    expect(toBe.categoryImpacts[0]?.brazilianTaxTreatment).toBe("capital_gain");
    expect(toBe.obligations.some((o) => o.code === "GCAP" && o.required)).toBe(true);
  });

  it("marks CBE as a probe and return lifecycle after prior exit", () => {
    const toBe = buildToBeImpact({
      inventory: {
        residency: {
          firstEntryBrazilDate: "2026-03-01",
          entryPathway: "permanent_visa",
          priorPermanentExitBrazil: true,
          priorPermanentExitDate: "2020-01-01",
          currentlyFiscalResidentBrazil: false
        },
        countryFootprint: [],
        incomes: [],
        assets: [
          { name: "Brokerage", assetType: "brokerage", country: "US", currentValue: 2_000_000, currency: "USD" }
        ],
        entities: [],
        trusts: [],
        financialAccountsSummary: ["Schwab"]
      },
      hypothesisResidencyDate: "2026-07-01"
    });
    expect(toBe.residency.lifecycleState).toBe("return");
    const cbe = toBe.obligations.find((o) => o.code === "CBE");
    expect(cbe?.probe).toBe(true);
    expect(cbe?.required).toBe(true);
  });
});
