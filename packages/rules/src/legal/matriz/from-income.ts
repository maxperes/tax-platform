import type {
  BrazilianTaxRegime,
  ForeignIncomeItem,
  IrpfExtCaseInput,
  IrpfExtNature
} from "@tax-platform/shared";
import { applyBrIrpfExt001, type IrpfExt001Result } from "./br-irpf-ext-001.js";
import type { CarnetLeaoItem, MonthlyAggregate } from "../../monthly-carne-leao.js";
import { aggregateMonthlyCarnetLeao } from "../../monthly-carne-leao.js";
import type { BrRulePack2026 } from "../../data/br/2026.js";
import { effectiveRate } from "../../progressive.js";
import type { IncomeClassificationLike } from "../../income-routing.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map free-text income type / nature onto BR-IRPF-EXT-001 natures. */
export function naturezaFromIncomeLabels(incomeType: string, nature?: string): IrpfExtNature {
  const t = `${incomeType} ${nature ?? ""}`.toLowerCase();
  if (/social[_\s-]?security|\bssa\b|aposentadoria|pension|retirement/.test(t)) return "aposentadoria";
  if (/pens[aã]o|alimony/.test(t)) return "pensao";
  if (/aluguel|rental|\brent\b/.test(t)) return "aluguel";
  if (/royalt/.test(t)) return "royalties";
  if (/juros|\binterest\b/.test(t)) return "juros";
  if (/dividend|distribui/.test(t)) return "dividendos";
  if (/trabalho|salary|wage|consult|freelance|\bwork\b|bonus|wages/.test(t)) return "trabalho";
  return "outros_rendimentos";
}

export function regimeFromClassification(
  classification?: IncomeClassificationLike | null
): BrazilianTaxRegime {
  if (classification?.lei14754ForeignProfitsEligible) return "lei_14754_offshore";
  const module = classification?.calculationModule;
  if (module === "capital_gain") return "ganho_capital";
  if (module === "trust_offshore") return "lei_14754_offshore";
  return "progressivo";
}

export function classifiedIncomeToIrpfExtItem(input: {
  id: string;
  originCountry: string;
  incomeType: string;
  nature?: string;
  originalCurrency: string;
  grossAmount: number;
  paymentDate: string;
  taxPaidOriginCountry?: number;
  exchangeRateToBrl?: number;
  classification?: IncomeClassificationLike | null;
}): ForeignIncomeItem {
  const regime = regimeFromClassification(input.classification);
  return {
    id: input.id,
    natureza: naturezaFromIncomeLabels(input.incomeType, input.nature),
    paisFonte: input.originCountry,
    dataDisponibilidade: input.paymentDate,
    moeda: input.originalCurrency.toUpperCase(),
    valorBruto: input.grossAmount,
    titularidade: 1,
    regimeBrasileiro: regime,
    impostoPagoExterior: input.taxPaidOriginCountry,
    taxaConversaoBrl: input.exchangeRateToBrl && input.exchangeRateToBrl > 0 ? input.exchangeRateToBrl : undefined,
    documentos: []
  };
}

function competenciaToParts(competencia: string): { year: number; month: number } {
  return {
    year: Number(competencia.slice(0, 4)),
    month: Number(competencia.slice(5, 7))
  };
}

/** Persist-friendly monthly rows from BR-IRPF-EXT-001, allocated back to source items. */
export function irpfExtResultToMonthlyAggregates(
  result: IrpfExt001Result,
  sourceItems: CarnetLeaoItem[],
  ruleVersion: string
): MonthlyAggregate[] {
  const byId = new Map(sourceItems.map((it) => [it.incomeSourceId ?? "", it]));
  const out: MonthlyAggregate[] = [];
  for (const month of result.months) {
    const { year, month: m } = competenciaToParts(month.competencia);
    const lines = sourceItems.filter((it) => it.paymentDate.slice(0, 7) === month.competencia);
    const weights = lines.map((it) => it.taxableAmount || it.amountBrl);
    const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
    const allocated: CarnetLeaoItem[] = lines.map((it, i) => {
      const share = (weights[i] ?? 0) / weightSum;
      return {
        ...it,
        calculatedTax: round2(month.imposto_apurado_brl * share)
      };
    });
    for (const ev of result.items) {
      const src = byId.get(ev.itemId);
      if (src && !allocated.some((a) => a.incomeSourceId === src.incomeSourceId)) {
        allocated.push({ ...src, calculatedTax: 0 });
      }
    }
    out.push({
      month: m,
      year,
      taxableBaseBrl: month.base_calculo_brl,
      grossTax: month.imposto_apurado_brl,
      foreignTaxCreditApplied: month.credito_exterior_aplicado_brl,
      netTaxDue: month.imposto_a_recolher_brl,
      rate: effectiveRate(month.imposto_apurado_brl, month.base_calculo_brl),
      items: allocated,
      ruleVersion,
      requiresAdditionalReview:
        month.revisao_profissional_obrigatoria || lines.some((l) => l.requiresReview)
    });
  }
  return out.sort((a, b) => a.year - b.year || a.month - b.month);
}

function mergeMonthlyAggregates(a: MonthlyAggregate, b: MonthlyAggregate): MonthlyAggregate {
  const grossTax = round2(a.grossTax + b.grossTax);
  const taxableBaseBrl = round2(a.taxableBaseBrl + b.taxableBaseBrl);
  const foreignTaxCreditApplied = round2(a.foreignTaxCreditApplied + b.foreignTaxCreditApplied);
  return {
    month: a.month,
    year: a.year,
    taxableBaseBrl,
    grossTax,
    foreignTaxCreditApplied,
    netTaxDue: round2(Math.max(0, grossTax - foreignTaxCreditApplied)),
    rate: taxableBaseBrl > 0 ? effectiveRate(grossTax, taxableBaseBrl) : 0,
    items: [...a.items, ...b.items],
    ruleVersion: a.ruleVersion,
    requiresAdditionalReview: a.requiresAdditionalReview || b.requiresAdditionalReview
  };
}

/**
 * Copilot/pipeline carnê-leão: progressive foreign income through BR-IRPF-EXT-001;
 * Lei 14.754 lines keep the flat-rate monthly aggregate.
 */
export function computeMonthlyViaIrpfExt001(input: {
  residencyStart: string;
  residencyEnd?: string;
  dependents?: number;
  age?: number;
  itens: IrpfExtCaseInput["itens"];
  lei14754Items: CarnetLeaoItem[];
  pack: BrRulePack2026;
  ruleVersion: string;
  sourceItems: CarnetLeaoItem[];
}): MonthlyAggregate[] {
  const byKey = new Map<string, MonthlyAggregate>();
  const put = (agg: MonthlyAggregate) => {
    const key = `${agg.year}-${agg.month}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeMonthlyAggregates(existing, agg) : agg);
  };

  if (input.itens.length > 0) {
    const result = applyBrIrpfExt001({
      dataInicioResidenciaBr: input.residencyStart,
      dataFimResidenciaBr: input.residencyEnd,
      dependentes: input.dependents ?? 0,
      idade: input.age,
      itens: input.itens
    });
    for (const agg of irpfExtResultToMonthlyAggregates(result, input.sourceItems, input.ruleVersion)) {
      put(agg);
    }
  }

  if (input.lei14754Items.length > 0) {
    for (const agg of aggregateMonthlyCarnetLeao(input.lei14754Items, {
      pack: input.pack,
      ruleVersion: input.ruleVersion
    })) {
      put(agg);
    }
  }

  return [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}
