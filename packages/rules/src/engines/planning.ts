import type {
  PlanningOpportunity,
  TwinInventory,
  UserPlan
} from "@tax-platform/shared";
import { stampFromRules } from "../legal/reliability.js";
import { findRulesByTag } from "../legal/reliability.js";
import { getBrLegalRules } from "../legal/packs/br-2026.js";
import type { ToBeImpactResult } from "./to-be-impact.js";

export type PlanningResult = {
  opportunities: PlanningOpportunity[];
  actionPlan: PlanningOpportunity[];
  estimatedSavingsTeaser: string;
  proUnlocked: boolean;
  scenarios: PlanningScenarioResult[];
};

export type PlanningScenarioResult = {
  id: string;
  label: string;
  description: string;
  estimatedBrTaxDelta: number;
  notes: string[];
  proOnly: boolean;
};

/**
 * Planning Engine — Layer 3. Full opportunities for Pro; Basic gets teasers only.
 */
export function buildPlanningResult(input: {
  inventory: TwinInventory;
  toBe: ToBeImpactResult;
  plan: UserPlan;
}): PlanningResult {
  const rules = getBrLegalRules();
  const asOf = input.toBe.hypothesisResidencyDate;
  const cfc = findRulesByTag(rules, "cfc", asOf);
  const ftc = findRulesByTag(rules, "ftc", asOf);
  const proUnlocked = input.plan === "pro";

  const all: PlanningOpportunity[] = [
    {
      id: "distribute-dividends-before",
      title: "Distribute retained earnings before Brazilian residency",
      description:
        "If controlled foreign companies hold retained profits, distributing before residency date D may change Brazilian characterization.",
      estimatedSavingsHint: "Case-specific — often material for CFCs",
      priority: 1,
      proOnly: true,
      reliability: stampFromRules("Pre-residency dividend distribution", cfc)
    },
    {
      id: "review-llc",
      title: "Review LLC tax transparency vs Brazilian treatment",
      description: "Document check-the-box / transparency posture and Brazilian entity mapping before the move.",
      priority: 2,
      proOnly: true,
      reliability: stampFromRules("LLC reorganization review", cfc)
    },
    {
      id: "sell-before-residency",
      title: "Accelerate sale of assets with built-in gains",
      description:
        "Selling selected assets before residency may keep gains outside Brazilian worldwide taxation (subject to origin-country tax).",
      estimatedSavingsHint: `Gross BR impact on file ≈ ${input.toBe.estimatedBrGrossTaxTotal.toFixed(0)} (not a savings quote)`,
      priority: 3,
      proOnly: true
    },
    {
      id: "gather-foreign-docs",
      title: "Gather foreign tax documentation",
      description: "Collect W-2/1099/1040, SSA-1099, withholding certificates to support FTC/reciprocity.",
      priority: 4,
      proOnly: false,
      reliability: stampFromRules("Foreign tax documentation for FTC", ftc)
    },
    {
      id: "choose-residency-date",
      title: "Choose the ideal Brazilian residency acquisition date",
      description: "Compare January vs mid-year vs next calendar year for carnê-leão and annual IRPF exposure.",
      priority: 5,
      proOnly: true
    },
    {
      id: "rabe-election",
      title: "Evaluate RABE / special regimes if eligible",
      description: "If returning Brazilian or special regimes apply, model election timing before residency crystallizes.",
      priority: 6,
      proOnly: true,
      reliability: stampFromRules("RABE / special regime review", cfc)
    },
    {
      id: "br-holding",
      title: "Model Brazilian holding vs keep foreign LLC",
      description: "Compare Lucro Presumido / holding structures against leaving assets offshore under Lei 14.754.",
      priority: 7,
      proOnly: true
    }
  ];

  const opportunities = proUnlocked ? all : all.filter((o) => !o.proOnly).concat(
    all
      .filter((o) => o.proOnly)
      .slice(0, 2)
      .map((o) => ({
        ...o,
        title: `[Pro] ${o.title}`,
        description: `${o.description} (Unlock Pro for full modeling.)`,
        estimatedSavingsHint: o.estimatedSavingsHint ?? "Available on Pro"
      }))
  );

  const actionPlan = [...opportunities].sort((a, b) => a.priority - b.priority);

  const scenarios: PlanningScenarioResult[] = [
    {
      id: "move-january",
      label: "Become resident in January",
      description: "Full calendar year of Brazilian worldwide taxation after D.",
      estimatedBrTaxDelta: input.toBe.estimatedBrGrossTaxTotal,
      notes: ["Gross annual estimate from To Be incomes."],
      proOnly: true
    },
    {
      id: "move-july",
      label: "Become resident in July",
      description: "Roughly half-year Brazilian exposure on recurring foreign income (simplified).",
      estimatedBrTaxDelta: input.toBe.estimatedBrGrossTaxTotal * 0.5,
      notes: ["Simplified proration — not a statutory mid-year engine."],
      proOnly: true
    },
    {
      id: "defer-next-year",
      label: "Defer residency to next calendar year",
      description: "Keeps current year outside Brazilian residency (subject to 183-day / visa facts).",
      estimatedBrTaxDelta: 0,
      notes: ["Assumes residency start pushed past year-end."],
      proOnly: true
    },
    {
      id: "sell-before",
      label: "Sell high-gain assets before D",
      description: "Removes modeled capital-gain lines from post-residency BR base (simplified).",
      estimatedBrTaxDelta: -sumCategory(input.toBe, /capital_gain/i),
      notes: ["Origin-country tax on the sale is not modeled here."],
      proOnly: true
    }
  ];

  return {
    opportunities,
    actionPlan,
    estimatedSavingsTeaser: proUnlocked
      ? "Full planning scenarios unlocked."
      : `Potential planning upside relates to ~${input.toBe.estimatedBrGrossTaxTotal.toFixed(0)} BRL gross BR impact on file — upgrade to Pro for scenario modeling.`,
    proUnlocked,
    scenarios: proUnlocked ? scenarios : scenarios.map((s) => ({ ...s, notes: [...s.notes, "Pro required to run."] }))
  };
}

function sumCategory(toBe: ToBeImpactResult, re: RegExp): number {
  return toBe.categoryImpacts
    .filter((c) => re.test(c.category))
    .reduce((s, c) => s + (c.estimatedBrGrossTax ?? 0), 0);
}
