/**
 * Public-case replay suite — cited RFB / CARF fixtures.
 * @see docs/tax-rules-governance.md (Public-case fixtures)
 */
import { describe, expect, it } from "vitest";
import { LEGAL_RULE_PACK_BR_2026 } from "@tax-platform/shared";
import { taxFromProgressiveTable } from "../../progressive.js";
import { BR_IRPF_ANNUAL_2026 } from "../../data/br/2026.js";
import { buildImpactAssessmentReport } from "../../engines/impact-assessment-report.js";
import { convertToBrlCamBio001 } from "../matriz/br-cambio-001.js";
import { computeCredExt001 } from "../matriz/br-cred-ext-001.js";
import { applyBrIrpfExt001 } from "../matriz/br-irpf-ext-001.js";
import { carf2201011434 } from "./carf-2201-011-434.js";
import { rfbPrIrpf2026Q140Ex1, rfbPrIrpf2026Q140Ex2 } from "./rfb-pr-irpf-2026-q140.js";
import type { PublicCaseFixture } from "./types.js";

const TWIN_CASES: PublicCaseFixture[] = [rfbPrIrpf2026Q140Ex1, carf2201011434];
const LEGAL_CASES: PublicCaseFixture[] = [rfbPrIrpf2026Q140Ex1, rfbPrIrpf2026Q140Ex2];

function replayImpact(fixture: PublicCaseFixture) {
  const twin = fixture.twin;
  const expected = fixture.expectedImpact;
  if (!twin || !expected) {
    throw new Error(`${fixture.id}: Twin impact replay requires twin + expectedImpact`);
  }
  return buildImpactAssessmentReport({
    inventory: twin.inventory,
    persons: twin.persons,
    hypothesisResidencyDate: twin.hypothesisResidencyDate,
    plan: twin.plan
  });
}

describe("public-case golden replay", () => {
  for (const fixture of TWIN_CASES) {
    it(`${fixture.id} — Impact Assessment expected results`, () => {
      const expected = fixture.expectedImpact!;
      const report = replayImpact(fixture);

      expect(report.sections).toHaveLength(expected.sectionCount);
      expect(report.legalRulePackId).toBe(LEGAL_RULE_PACK_BR_2026);
      expect(report.title).toMatch(/Impact Assessment/i);

      const { brazilImpact } = report.layers;
      if (expected.residencyMethod) {
        expect(brazilImpact.residency.method).toBe(expected.residencyMethod);
      }
      if (expected.requiresAdditionalReview) {
        expect(report.requiresAdditionalReview).toBe(true);
        expect(brazilImpact.residency.requiresReview).toBe(true);
      }
      for (const code of expected.requiredObligations) {
        expect(brazilImpact.obligations.some((o) => o.code === code && o.required)).toBe(true);
      }
      for (const [category, taxability] of Object.entries(expected.categoryTaxability)) {
        const row = brazilImpact.categoryImpacts.find((c) => c.category === category);
        expect(row?.taxability).toBe(taxability);
      }
      for (const code of expected.requiredRisks ?? []) {
        expect(brazilImpact.risks.some((r) => r.code === code)).toBe(true);
      }
      if (expected.grossTaxBaseBrl !== undefined) {
        const expectedGross = taxFromProgressiveTable(expected.grossTaxBaseBrl, BR_IRPF_ANNUAL_2026);
        expect(brazilImpact.estimatedBrGrossTaxTotal).toBeCloseTo(expectedGross, 4);
      }
    });
  }

  for (const fixture of LEGAL_CASES) {
    const legal = fixture.legal;
    if (!legal) continue;

    if (legal.fx) {
      it(`${fixture.id} — BR-CAMBIO-001 FX conversion`, () => {
        const fx = legal.fx!;
        const result = convertToBrlCamBio001({
          valor: fx.valor,
          moeda: fx.moeda,
          dataDisponibilidade: fx.dataDisponibilidade,
          taxaConversaoBrl: fx.taxaConversaoBrl
        });
        expect(result.valorBrl).toBe(fx.expectedValorBrl);
        expect(result.metodo).toBe("explicit");
      });
    }

    if (legal.credit) {
      it(`${fixture.id} — BR-CRED-EXT-001 foreign tax credit`, () => {
        const credit = legal.credit!;
        const result = computeCredExt001({
          impostoBrasileiroComRendimento: credit.impostoBrasileiroComRendimento,
          impostoBrasileiroSemRendimento: credit.impostoBrasileiroSemRendimento,
          impostoPagoExteriorBrl: credit.impostoPagoExteriorBrl,
          reciprocidadeReconhecida: credit.reciprocidadeReconhecida
        });
        expect(result.limiteCreditoBrl).toBe(credit.expectedLimiteCreditoBrl);
        expect(result.creditoAplicadoBrl).toBe(credit.expectedCreditoAplicadoBrl);
      });
    }

    if (legal.irpfExt && legal.expectedIncidence) {
      it(`${fixture.id} — BR-IRPF-EXT-001 incidence (not DAA with/without)`, () => {
        const result = applyBrIrpfExt001(legal.irpfExt!);
        expect(result.items[0]?.outcome).toBe(legal.expectedIncidence);
        expect(result.months.length).toBeGreaterThan(0);
      });
    }
  }

  it("RFB Q140 Ex.2 converts published foreign tax at the same fictitious PTAX", () => {
    const taxPaid = convertToBrlCamBio001({
      valor: 1_500,
      moeda: "USD",
      dataDisponibilidade: "2023-09-24",
      taxaConversaoBrl: 5.2468
    });
    expect(taxPaid.valorBrl).toBe(7_870.2);
  });

  it("CARF 2201-011.434 notes vital-interest substance without deciding already_resident", () => {
    const report = replayImpact(carf2201011434);
    expect(report.layers.brazilImpact.residency.method).not.toBe("already_resident");
    expect(report.layers.brazilImpact.residency.notes.join(" ")).toMatch(/vital-interest/i);
  });
});
