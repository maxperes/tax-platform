import type {
  PlanningOpportunity,
  TwinInventory,
  TwinPersonInput,
  UserPlan
} from "@tax-platform/shared";
import { stampFromRules } from "../legal/reliability.js";
import { findRulesByTag } from "../legal/reliability.js";
import { getBrLegalRules } from "../legal/packs/br-2026.js";
import { buildToBeImpact, type ToBeImpactResult } from "./to-be-impact.js";
import { resolveIncomeTreatment } from "./income-treatment.js";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function taxYearFromIso(iso: string): number {
  const year = Number(iso.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : new Date().getUTCFullYear();
}

function remainingYearFraction(residencyDate: string, taxYear: number): number {
  const year = Number(residencyDate.slice(0, 4));
  const month = Number(residencyDate.slice(5, 7));
  if (year > taxYear) return 0;
  if (year < taxYear) return 1;
  if (!month) return 1;
  return (13 - month) / 12;
}

function scenarioHeadlineTax(toBe: ToBeImpactResult): number {
  return toBe.brazilianTaxTotal > 0 ? toBe.brazilianTaxTotal : toBe.estimatedBrGrossTaxTotal;
}

/** Recurring undated lines are scaled to months remaining after D; dated lines keep To Be slicing. */
function inventoryForResidencyDate(
  inventory: TwinInventory,
  residencyDate: string,
  taxYear: number
): TwinInventory {
  const fraction = remainingYearFraction(residencyDate, taxYear);
  return {
    ...inventory,
    residency: {
      ...inventory.residency,
      currentlyFiscalResidentBrazil: false,
      firstEntryBrazilDate: residencyDate,
      entryPathway:
        inventory.residency.entryPathway && inventory.residency.entryPathway !== "unknown"
          ? inventory.residency.entryPathway
          : "permanent_visa"
    },
    incomes: inventory.incomes.map((line) => {
      if (line.paymentDate) return line;
      if (line.periodicity === "one_off") return line;
      return { ...line, annualAmount: round2(line.annualAmount * fraction) };
    })
  };
}

function inventoryWithoutCapitalGains(inventory: TwinInventory): TwinInventory {
  return {
    ...inventory,
    incomes: inventory.incomes.filter((line) => {
      const resolved = resolveIncomeTreatment(line);
      return resolved.treatment !== "capital_gain";
    })
  };
}

function runToBe(input: {
  inventory: TwinInventory;
  persons?: TwinPersonInput[];
  hypothesisResidencyDate: string;
  applyReliefs: boolean;
}): ToBeImpactResult {
  return buildToBeImpact({
    inventory: input.inventory,
    persons: input.persons,
    hypothesisResidencyDate: input.hypothesisResidencyDate,
    applyReliefs: input.applyReliefs
  });
}

/**
 * Planning Engine — Layer 3. Full opportunities for Pro; Basic gets teasers only.
 * Date and sell-before scenarios re-run the To Be engine (not 50% heuristics).
 */
export function buildPlanningResult(input: {
  inventory: TwinInventory;
  persons?: TwinPersonInput[];
  toBe: ToBeImpactResult;
  plan: UserPlan;
}): PlanningResult {
  const rules = getBrLegalRules();
  const asOf = input.toBe.hypothesisResidencyDate;
  const taxYear = taxYearFromIso(asOf);
  const cfc = findRulesByTag(rules, "cfc", asOf);
  const ftc = findRulesByTag(rules, "ftc", asOf);
  const proUnlocked = input.plan === "pro";
  const applyReliefs = input.toBe.applyReliefs;
  const baselineTax = scenarioHeadlineTax(input.toBe);

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

  const januaryDate = `${taxYear}-01-01`;
  const julyDate = `${taxYear}-07-01`;
  const deferDate = `${taxYear + 1}-01-01`;

  const january = runToBe({
    inventory: inventoryForResidencyDate(input.inventory, januaryDate, taxYear),
    persons: input.persons,
    hypothesisResidencyDate: januaryDate,
    applyReliefs
  });
  const july = runToBe({
    inventory: inventoryForResidencyDate(input.inventory, julyDate, taxYear),
    persons: input.persons,
    hypothesisResidencyDate: julyDate,
    applyReliefs
  });
  const defer = runToBe({
    inventory: inventoryForResidencyDate(input.inventory, deferDate, taxYear),
    persons: input.persons,
    hypothesisResidencyDate: deferDate,
    applyReliefs
  });
  const sellBefore = runToBe({
    inventory: inventoryWithoutCapitalGains(input.inventory),
    persons: input.persons,
    hypothesisResidencyDate: asOf,
    applyReliefs
  });

  const scenarios: PlanningScenarioResult[] = [
    {
      id: "move-january",
      label: "Become resident in January",
      description: "Full calendar year of Brazilian worldwide taxation after 1 January.",
      estimatedBrTaxDelta: scenarioHeadlineTax(january),
      notes: [
        `Re-ran To Be with residency start ${januaryDate}.`,
        `Net/gross BR tax ${scenarioHeadlineTax(january).toFixed(2)} ${january.currency}.`
      ],
      proOnly: true
    },
    {
      id: "move-july",
      label: "Become resident in July",
      description: "Brazilian exposure from 1 July: dated lines sliced by availability; undated recurring income scaled to remaining months.",
      estimatedBrTaxDelta: scenarioHeadlineTax(july),
      notes: [
        `Re-ran To Be with residency start ${julyDate}.`,
        `Net/gross BR tax ${scenarioHeadlineTax(july).toFixed(2)} ${july.currency}.`
      ],
      proOnly: true
    },
    {
      id: "defer-next-year",
      label: "Defer residency to next calendar year",
      description: "Pushes residency start to 1 January of the following year (subject to 183-day / visa facts).",
      estimatedBrTaxDelta: scenarioHeadlineTax(defer),
      notes: [
        `Re-ran To Be with residency start ${deferDate}.`,
        `Current-year BR tax ${scenarioHeadlineTax(defer).toFixed(2)} ${defer.currency}.`
      ],
      proOnly: true
    },
    {
      id: "sell-before",
      label: "Sell high-gain assets before D",
      description: "Removes capital-gain treatment lines and re-runs To Be at the original hypothesis date.",
      estimatedBrTaxDelta: round2(scenarioHeadlineTax(sellBefore) - baselineTax),
      notes: [
        "Origin-country tax on the sale is not modeled here.",
        `Delta vs baseline ${round2(scenarioHeadlineTax(sellBefore) - baselineTax).toFixed(2)} ${input.toBe.currency}.`
      ],
      proOnly: true
    }
  ];

  return {
    opportunities,
    actionPlan,
    estimatedSavingsTeaser: proUnlocked
      ? "Full planning scenarios unlocked (each scenario re-runs the To Be engine)."
      : `Potential planning upside relates to ~${input.toBe.estimatedBrGrossTaxTotal.toFixed(0)} BRL gross BR impact on file — upgrade to Pro for scenario modeling.`,
    proUnlocked,
    scenarios: proUnlocked ? scenarios : scenarios.map((s) => ({ ...s, notes: [...s.notes, "Pro required to run."] }))
  };
}
