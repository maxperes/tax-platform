/**
 * BR-IRPF-EXT-001 — IRPF on foreign-source income of a Brazilian tax resident.
 * Executable regra-matriz (incidence + monthly carnê-leão apuration).
 */

import {
  foreignIncomeItemSchema,
  irpfExtCaseSchema,
  type ForeignIncomeItem,
  type IrpfExtCase,
  type IrpfExtCaseInput,
  type IncidenceOutcome,
  type CertezaStatus
} from "@tax-platform/shared";
import { taxFromProgressiveTable, effectiveRate } from "../../progressive.js";
import { convertToBrlCamBio001 } from "./br-cambio-001.js";
import { computeCredExt001 } from "./br-cred-ext-001.js";
import {
  BR_IRPF_MENSAL_RULESET_VERSAO,
  resolveMonthlyProgressiveTable
} from "./tables/br-irpf-mensal-2025-05.js";

export const BR_IRPF_EXT_001_META = {
  id: "BR-IRPF-EXT-001",
  versao: "1.0.0",
  rulesetVersao: BR_IRPF_MENSAL_RULESET_VERSAO,
  tributo: "IRPF",
  especie: "regra_de_incidencia",
  grauCertezaIncidencia: "pacifico" as const,
  dependeDe: ["BR-RESID-001", "BR-CAMBIO-001"],
  ePressupostoDe: ["BR-CRED-EXT-001", "BR-DEVER-CARNE-001", "BR-DEVER-DIRPF-001"],
  fontes: [
    { peso: 1, citation: "CTN, art. 43" },
    { peso: 1, citation: "Lei 7.713/1988, arts. 1º a 3º" },
    { peso: 1, citation: "Lei 9.250/1995" },
    { peso: 2, citation: "RIR/2018 (Dec. 9.580/2018)" },
    { peso: 2, citation: "IN SRF 208/2002" },
    { peso: 2, citation: "IN RFB 1.500/2014" }
  ]
} as const;

const MATERIAL_NATURES = new Set([
  "trabalho",
  "aposentadoria",
  "pensao",
  "aluguel",
  "royalties",
  "juros",
  "dividendos",
  "outros_rendimentos"
]);

export type ExcludenteEval = {
  status: "nao_aplica" | "aplica" | "controvertido";
  codigo?: string;
  fundamento: string;
  certeza: CertezaStatus;
};

export type ItemEvaluation = {
  itemId: string;
  outcome: IncidenceOutcome;
  roteadoPara?: string;
  excludente?: ExcludenteEval;
  valorBrutoProporcional: number;
  valorConvertidoBrl?: number;
  despesasBrl?: number;
  impostoExteriorBrl?: number;
  taxaConversao?: number;
  notes: string[];
};

export type MonthlyConsequente = {
  regra_id: "BR-IRPF-EXT-001";
  ruleset_versao: string;
  incide: boolean;
  competencia: string;
  base_calculo_brl: number;
  aliquota_efetiva: number;
  imposto_apurado_brl: number;
  credito_exterior_aplicado_brl: number;
  imposto_a_recolher_brl: number;
  limite_credito_brl: number;
  vencimento: string;
  obrigacoes_acessorias: string[];
  grau_de_certeza: CertezaStatus;
  revisao_profissional_obrigatoria: boolean;
  cenarios?: {
    sem_isencao: { base_calculo_brl: number; imposto_apurado_brl: number };
    com_parcela_isenta_65: { base_calculo_brl: number; imposto_apurado_brl: number; parcela_isenta_brl: number };
    diferenca_brl: number;
  };
  trace: {
    documentos: string[];
    campos_extraidos: string[];
    regras_aplicadas: string[];
    premissas: string[];
  };
};

export type IrpfExt001Result = {
  regraId: "BR-IRPF-EXT-001";
  items: ItemEvaluation[];
  months: MonthlyConsequente[];
  foraDoCampo: ItemEvaluation[];
  roteados: ItemEvaluation[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function residenteEm(
  caso: Pick<IrpfExtCase, "dataInicioResidenciaBr" | "dataFimResidenciaBr">,
  data: string
): boolean {
  if (data < caso.dataInicioResidenciaBr) return false;
  if (caso.dataFimResidenciaBr && data > caso.dataFimResidenciaBr) return false;
  return true;
}

export function incideMaterial(item: ForeignIncomeItem): boolean {
  if (!MATERIAL_NATURES.has(item.natureza)) return false;
  if (item.regimeBrasileiro === "tributacao_definitiva") return false;
  if (item.regimeBrasileiro === "lei_14754_offshore") return false;
  if (item.regimeBrasileiro === "ganho_capital") return false;
  return true;
}

export function routeAway(item: ForeignIncomeItem): string | null {
  if (item.regimeBrasileiro === "ganho_capital") return "BR-GCAP-EXT";
  if (item.regimeBrasileiro === "lei_14754_offshore") return "BR-LEI-14754";
  if (item.regimeBrasileiro === "tributacao_definitiva") return "BR-IRPF-DEFINITIVA";
  if (item.paisFonte.toUpperCase() === "BR") return "BR-IRPF-DOMESTICO";
  return null;
}

export function avaliarExcludentes(
  item: ForeignIncomeItem,
  caso: IrpfExtCase
): ExcludenteEval {
  if (!residenteEm(caso, item.dataDisponibilidade)) {
    return {
      status: "aplica",
      codigo: "nao_residente_na_data",
      fundamento: "Absence of connecting factor — fora_do_campo (not exemption)",
      certeza: "pacifico"
    };
  }

  if (
    (item.natureza === "aposentadoria" || item.natureza === "pensao") &&
    caso.molestiaGraveComprovada
  ) {
    return {
      status: "controvertido",
      codigo: "molestia_grave_fonte_estrangeira",
      fundamento:
        "Moléstia grave exemption literalidade points to Brazilian sources; extension to foreign social security is contested",
      certeza: "controvertido"
    };
  }

  if (
    (item.natureza === "aposentadoria" || item.natureza === "pensao") &&
    caso.idade !== undefined &&
    caso.idade >= 65
  ) {
    return {
      status: "controvertido",
      codigo: "parcela_isenta_65_fonte_estrangeira",
      fundamento:
        "Over-65 exempt parcel contested when source is foreign — dual scenarios required",
      certeza: "controvertido"
    };
  }

  return {
    status: "nao_aplica",
    fundamento: "No exclusion applies",
    certeza: "pacifico"
  };
}

/** Last calendar day of next month (business-day calendar not wired — fixtures use known dates). */
export function vencimentoCarneLeao(competenciaYYYYMM: string, override?: string): string {
  if (override) return override;
  const [y, m] = competenciaYYYYMM.split("-").map(Number);
  // competencia 2026-01 → due end of Feb 2026
  const year = m === 12 ? y! + 1 : y!;
  const month = m === 12 ? 1 : m! + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function natureExpenseBrl(item: ForeignIncomeItem, taxa: number): number {
  if (item.natureza !== "aluguel") return 0;
  return round2((item.despesasAdmitidas ?? 0) * item.titularidade * taxa);
}

/**
 * Parcel isenta 65+ — amount is a parameter; use monthly table first-bracket ceiling as proxy
 * when dual-scenario is required (SME must confirm statutory parcel).
 */
function parcelaIsenta65Proxy(asOf: string): number {
  const table = resolveMonthlyProgressiveTable(asOf);
  return table.rows[0]?.upperBound ?? 0;
}

export function applyBrIrpfExt001(
  rawCase: IrpfExtCaseInput,
  opts?: { vencimentoOverrides?: Record<string, string> }
): IrpfExt001Result {
  const caso = irpfExtCaseSchema.parse(rawCase);
  const items: ItemEvaluation[] = [];
  const foraDoCampo: ItemEvaluation[] = [];
  const roteados: ItemEvaluation[] = [];

  type AccLine = {
    item: ForeignIncomeItem;
    eval: ItemEvaluation;
    liquidoBrl: number;
    impostoExteriorBrl: number;
    contested65: boolean;
  };

  const byMonth = new Map<string, AccLine[]>();

  for (const raw of caso.itens) {
    const item = foreignIncomeItemSchema.parse(raw);
    const itemId = item.id ?? `${item.natureza}-${item.dataDisponibilidade}`;
    const notes: string[] = [];
    const proporcao = item.titularidade;
    const valorProp = round2(item.valorBruto * proporcao);

    if (!residenteEm(caso, item.dataDisponibilidade)) {
      const ev: ItemEvaluation = {
        itemId,
        outcome: "fora_do_campo",
        valorBrutoProporcional: valorProp,
        notes: [
          "Received before Brazilian tax residency — absence of competence (fora_do_campo), not isento"
        ],
        excludente: {
          status: "aplica",
          codigo: "nao_residente_na_data",
          fundamento: "No Brazilian tax residency on availability date",
          certeza: "pacifico"
        }
      };
      items.push(ev);
      foraDoCampo.push(ev);
      continue;
    }

    const routed = routeAway(item);
    if (routed || !incideMaterial(item)) {
      const ev: ItemEvaluation = {
        itemId,
        outcome: "roteado",
        roteadoPara: routed ?? "OUTRA_REGRA",
        valorBrutoProporcional: valorProp,
        notes: ["Material criterion not met for BR-IRPF-EXT-001 — routed"]
      };
      items.push(ev);
      roteados.push(ev);
      continue;
    }

    const exc = avaliarExcludentes(item, caso);
    if (exc.status === "aplica" && exc.codigo === "nao_residente_na_data") {
      // already handled
    }

    const cambio = convertToBrlCamBio001({
      valor: valorProp,
      moeda: item.moeda,
      dataDisponibilidade: item.dataDisponibilidade,
      taxaConversaoBrl: item.taxaConversaoBrl
    });
    notes.push(...cambio.notes);

    const despesas = natureExpenseBrl(item, cambio.taxaAplicada);
    const impostoExt =
      item.impostoPagoExterior !== undefined
        ? convertToBrlCamBio001({
            valor: item.impostoPagoExterior * proporcao,
            moeda: item.moeda,
            dataDisponibilidade: item.dataDisponibilidade,
            taxaConversaoBrl: item.taxaConversaoBrl
          }).valorBrl
        : 0;

    const contested65 = exc.status === "controvertido" && exc.codigo === "parcela_isenta_65_fonte_estrangeira";
    const contestedMolestia =
      exc.status === "controvertido" && exc.codigo === "molestia_grave_fonte_estrangeira";

    const outcome: IncidenceOutcome =
      exc.status === "controvertido" ? "controvertido" : "incide";

    const ev: ItemEvaluation = {
      itemId,
      outcome,
      excludente: exc.status === "nao_aplica" ? undefined : exc,
      valorBrutoProporcional: valorProp,
      valorConvertidoBrl: cambio.valorBrl,
      despesasBrl: despesas,
      impostoExteriorBrl: impostoExt,
      taxaConversao: cambio.taxaAplicada,
      notes
    };
    items.push(ev);

    const competencia = item.dataDisponibilidade.slice(0, 7);
    const list = byMonth.get(competencia) ?? [];
    list.push({
      item,
      eval: ev,
      liquidoBrl: round2(cambio.valorBrl - despesas),
      impostoExteriorBrl: impostoExt,
      contested65: contested65 || contestedMolestia
    });
    byMonth.set(competencia, list);
  }

  const months: MonthlyConsequente[] = [];

  for (const [competencia, lines] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const asOf = `${competencia}-15`;
    const table = resolveMonthlyProgressiveTable(asOf);
    const depDed = round2(caso.dependentes * table.deducaoDependente);
    const pensao = caso.pensaoAlimenticiaJudicialBrl;

    const gross = round2(lines.reduce((s, l) => s + l.liquidoBrl, 0));
    const base = round2(Math.max(0, gross - depDed - pensao));
    const imposto = round2(taxFromProgressiveTable(base, table.rows));

    // Credit limit: two-pass — identify lines with foreign tax (typically rental in Case B)
    const withForeignTax = lines.filter((l) => l.impostoExteriorBrl > 0);
    const foreignTaxTotal = round2(lines.reduce((s, l) => s + l.impostoExteriorBrl, 0));

    let limite = imposto;
    let credito = 0;
    const premissas: string[] = [
      `titularidade applied per item`,
      `dependentes=${caso.dependentes}`,
      `deducao_dependente=${depDed}`
    ];

    if (withForeignTax.length > 0 && foreignTaxTotal > 0) {
      const excludeIds = new Set(withForeignTax.map((l) => l.eval.itemId));
      const grossSem = round2(
        lines.filter((l) => !excludeIds.has(l.eval.itemId)).reduce((s, l) => s + l.liquidoBrl, 0)
      );
      const baseSem = round2(Math.max(0, grossSem - depDed - pensao));
      const impostoSem = round2(taxFromProgressiveTable(baseSem, table.rows));
      const cred = computeCredExt001({
        impostoBrasileiroComRendimento: imposto,
        impostoBrasileiroSemRendimento: impostoSem,
        impostoPagoExteriorBrl: foreignTaxTotal,
        reciprocidadeReconhecida: withForeignTax.every((l) => l.item.paisFonte.toUpperCase() === "US")
          ? true
          : undefined,
        premissaRateio: "Foreign tax amounts are item-attributable as provided (not Form 1040 global)"
      });
      limite = cred.limiteCreditoBrl;
      credito = cred.creditoAplicadoBrl;
      premissas.push(...cred.premissas);
    }

    const devido = round2(Math.max(0, imposto - credito));
    const anyContested = lines.some((l) => l.eval.outcome === "controvertido");
    const documentos = lines.flatMap((l) => l.item.documentos ?? []);

    let cenarios: MonthlyConsequente["cenarios"];
    if (anyContested && lines.some((l) => l.contested65)) {
      const parcela = parcelaIsenta65Proxy(asOf);
      const baseIsento = round2(Math.max(0, base - parcela));
      const impostoIsento = round2(taxFromProgressiveTable(baseIsento, table.rows));
      cenarios = {
        sem_isencao: { base_calculo_brl: base, imposto_apurado_brl: imposto },
        com_parcela_isenta_65: {
          base_calculo_brl: baseIsento,
          imposto_apurado_brl: impostoIsento,
          parcela_isenta_brl: parcela
        },
        diferenca_brl: round2(imposto - impostoIsento)
      };
    }

    months.push({
      regra_id: "BR-IRPF-EXT-001",
      ruleset_versao: table.rulesetVersao,
      incide: true,
      competencia,
      base_calculo_brl: base,
      aliquota_efetiva: round2(effectiveRate(imposto, base) * 10000) / 10000,
      imposto_apurado_brl: imposto,
      credito_exterior_aplicado_brl: credito,
      imposto_a_recolher_brl: devido,
      limite_credito_brl: limite,
      vencimento: vencimentoCarneLeao(competencia, opts?.vencimentoOverrides?.[competencia]),
      obrigacoes_acessorias: ["BR-DEVER-CARNE-001", "BR-DEVER-DIRPF-001"],
      grau_de_certeza: anyContested ? "controvertido" : "pacifico",
      revisao_profissional_obrigatoria: anyContested,
      cenarios,
      trace: {
        documentos,
        campos_extraidos: lines.map(
          (l) =>
            `${l.eval.itemId}: bruto=${l.eval.valorConvertidoBrl} taxa=${l.eval.taxaConversao}`
        ),
        regras_aplicadas: [
          "BR-RESID-001",
          "BR-CAMBIO-001",
          "BR-CRED-EXT-001",
          "BR-IRPF-EXT-001"
        ],
        premissas
      }
    });
  }

  return {
    regraId: "BR-IRPF-EXT-001",
    items,
    months,
    foraDoCampo,
    roteados
  };
}
