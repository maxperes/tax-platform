import type { ProgressiveRow } from "../../../progressive.js";

/**
 * Monthly progressive IRPF / carnê-leão table — vigência from 2025-05-01.
 * Values from BR-IRPF-EXT-001 §5 fixtures — confirm with SME before production.
 */
export const BR_IRPF_MENSAL_VIGENCIA_INICIO = "2025-05-01";
export const BR_IRPF_MENSAL_RULESET_VERSAO = "2025.05";
export const BR_IRPF_MENSAL_DEDUCAO_DEPENDENTE = 189.59;

export const BR_IRPF_MENSAL_2025_05: ProgressiveRow[] = [
  { upperBound: 2428.8, rate: 0, deduction: 0 },
  { upperBound: 2826.65, rate: 0.075, deduction: 182.16 },
  { upperBound: 3751.05, rate: 0.15, deduction: 394.16 },
  { upperBound: 4664.68, rate: 0.225, deduction: 675.49 },
  { upperBound: Number.POSITIVE_INFINITY, rate: 0.275, deduction: 908.73 }
];

export function resolveMonthlyProgressiveTable(asOfDate: string): {
  rows: ProgressiveRow[];
  deducaoDependente: number;
  rulesetVersao: string;
  vigenciaInicio: string;
} {
  if (asOfDate < BR_IRPF_MENSAL_VIGENCIA_INICIO) {
    // Pre-May 2025 pack not modeled here — callers must supply or flag review.
    return {
      rows: BR_IRPF_MENSAL_2025_05,
      deducaoDependente: BR_IRPF_MENSAL_DEDUCAO_DEPENDENTE,
      rulesetVersao: BR_IRPF_MENSAL_RULESET_VERSAO,
      vigenciaInicio: BR_IRPF_MENSAL_VIGENCIA_INICIO
    };
  }
  return {
    rows: BR_IRPF_MENSAL_2025_05,
    deducaoDependente: BR_IRPF_MENSAL_DEDUCAO_DEPENDENTE,
    rulesetVersao: BR_IRPF_MENSAL_RULESET_VERSAO,
    vigenciaInicio: BR_IRPF_MENSAL_VIGENCIA_INICIO
  };
}
