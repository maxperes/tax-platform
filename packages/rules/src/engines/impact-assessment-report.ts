import type { TwinInventory, TwinPersonInput, UserPlan } from "@tax-platform/shared";
import { buildRuleVersionStamp, DATA_PACK_BR_2026, LEGAL_RULE_PACK_BR_2026 } from "@tax-platform/shared";
import { buildAsIsSnapshot } from "./facts.js";
import { buildToBeImpact, type ToBeImpactResult } from "./to-be-impact.js";
import { buildPlanningResult, type PlanningResult } from "./planning.js";

export type ImpactAssessmentReport = {
  title: string;
  ruleVersion: string;
  legalRulePackId: string;
  layers: {
    currentStatus: ReturnType<typeof buildAsIsSnapshot>;
    brazilImpact: ToBeImpactResult;
    opportunities: PlanningResult;
  };
  sections: {
    title: string;
    bodyMarkdown?: string;
    payload?: Record<string, unknown>;
    sortOrder: number;
  }[];
  requiresAdditionalReview: boolean;
};

/**
 * Executive International Tax Check-up report (4 sections).
 */
export function buildImpactAssessmentReport(input: {
  inventory: TwinInventory;
  persons?: TwinPersonInput[];
  hypothesisResidencyDate: string;
  plan: UserPlan;
  applyReliefs?: boolean;
}): ImpactAssessmentReport {
  const currentStatus = buildAsIsSnapshot({
    inventory: input.inventory,
    persons: input.persons
  });
  const brazilImpact = buildToBeImpact({
    inventory: currentStatus.inventory,
    persons: currentStatus.persons,
    hypothesisResidencyDate: input.hypothesisResidencyDate,
    applyReliefs: input.applyReliefs && input.plan === "pro"
  });
  const opportunities = buildPlanningResult({
    inventory: currentStatus.inventory,
    persons: currentStatus.persons,
    toBe: brazilImpact,
    plan: input.plan
  });

  const sections = [
    {
      title: "1. Current Status",
      sortOrder: 0,
      bodyMarkdown: [
        `As Is completion: **${currentStatus.completionPercent}%**.`,
        `Persons on file: ${currentStatus.persons.length}.`,
        `Income lines: ${currentStatus.inventory.incomes.length}; assets: ${currentStatus.inventory.assets.length}; entities: ${currentStatus.inventory.entities.length}; trusts: ${currentStatus.inventory.trusts.length}.`,
        "",
        "_This section is a factual inventory only — no recommendations._"
      ].join("\n"),
      payload: {
        moduleCompletion: currentStatus.moduleCompletion,
        residency: currentStatus.inventory.residency,
        countryFootprint: currentStatus.inventory.countryFootprint,
        persons: currentStatus.persons
      }
    },
    {
      title: "2. Brazil Impact Simulation",
      sortOrder: 1,
      bodyMarkdown: [
        `Hypothesis residency date: **${input.hypothesisResidencyDate}**.`,
        `Computed residency start method: **${brazilImpact.residency.method}** → ${brazilImpact.residency.brazilianTaxResidencyStartDate ?? "undetermined"}.`,
        `Estimated BR gross tax (annual incomes on file): **${brazilImpact.estimatedBrGrossTaxTotal.toFixed(2)} ${brazilImpact.currency}**.`,
        `Brazilian tax (BR-IRPF-EXT-001): **${brazilImpact.brazilianTaxTotal.toFixed(2)}**; foreign tax credit **${brazilImpact.foreignTaxCreditTotal.toFixed(2)}**; net payable **${brazilImpact.netPayableTotal.toFixed(2)}**.`,
        brazilImpact.crossBorderComparison.usFederal
          ? `US federal sketch (assumed single): **${brazilImpact.crossBorderComparison.usFederal.netTaxDueUsd.toFixed(2)} USD** on ${brazilImpact.crossBorderComparison.usFederal.grossIncomeUsd.toFixed(2)} USD gross.`
          : "No US federal sketch (no US person tie or convertible income on file).",
        brazilImpact.monthlyCarneLeao.length > 0
          ? `Monthly carnê-leão sketch: **${brazilImpact.monthlyCarneLeao.length}** competence(s).`
          : "No monthly carnê-leão sketch (matriz not applied).",
        `Lifecycle: **${brazilImpact.residency.lifecycleState}**. Resident from: ${brazilImpact.residency.brazilianTaxResidencyStartDate ?? "undetermined"}.`,
        brazilImpact.reliefsNote,
        "",
        "### Reliability",
        ...brazilImpact.reliabilityMatrix.slice(0, 8).map(
          (r) => `- ${r.conclusion} — ${r.sourcesSummary} (${r.certaintyTier}${r.dependsOnCosit ? ", COSIT-dependent" : ""})`
        )
      ].join("\n"),
      payload: {
        residency: brazilImpact.residency,
        situationSummary: brazilImpact.situationSummary,
        categoryImpacts: brazilImpact.categoryImpacts,
        obligations: brazilImpact.obligations,
        declarations: brazilImpact.declarations,
        monthlyCarneLeao: brazilImpact.monthlyCarneLeao,
        crossBorderComparison: brazilImpact.crossBorderComparison,
        doubleTax: brazilImpact.doubleTax,
        risks: brazilImpact.risks,
        reliabilityMatrix: brazilImpact.reliabilityMatrix
      }
    },
    {
      title: "3. Opportunities Before Immigration",
      sortOrder: 2,
      bodyMarkdown: [
        opportunities.estimatedSavingsTeaser,
        "",
        ...opportunities.opportunities.map((o) => `- **${o.title}** — ${o.description}`)
      ].join("\n"),
      payload: {
        opportunities: opportunities.opportunities,
        scenarios: opportunities.scenarios,
        proUnlocked: opportunities.proUnlocked
      }
    },
    {
      title: "4. Action Plan",
      sortOrder: 3,
      bodyMarkdown: opportunities.actionPlan
        .map((a, i) => `${i + 1}. **${a.title}** — ${a.description}`)
        .join("\n"),
      payload: { actionPlan: opportunities.actionPlan }
    }
  ];

  return {
    title: "Tax Residency Impact Assessment",
    ruleVersion: `${buildRuleVersionStamp(DATA_PACK_BR_2026)}+legal@${LEGAL_RULE_PACK_BR_2026}`,
    legalRulePackId: LEGAL_RULE_PACK_BR_2026,
    layers: { currentStatus, brazilImpact, opportunities },
    sections,
    requiresAdditionalReview: brazilImpact.requiresReview || currentStatus.completionPercent < 50
  };
}
