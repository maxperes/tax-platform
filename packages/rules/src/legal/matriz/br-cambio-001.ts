/**
 * BR-CAMBIO-001 — conversion of foreign-source amounts to BRL for IRPF/carnê-leão.
 *
 * Statutory sequence (IN SRF 208/2002 style):
 * 1) origin currency → USD at origin monetary authority quote on receipt date
 * 2) USD → BRL at BACEN buy rate for the last business day of the first fortnight
 *    of the month BEFORE the receipt month
 *
 * This module accepts an explicit `taxaConversaoBrl` (tests / SME feed) or a
 * simplified monthly PTAX lookup. Full BACEN calendar feed is a later integration.
 */

import { lookupPtaxToBrl } from "../../ptax.js";

export type CambioResult = {
  regraId: "BR-CAMBIO-001";
  valorBrl: number;
  taxaAplicada: number;
  metodo: "explicit" | "ptax_monthly_proxy" | "identity_brl";
  requiresReview: boolean;
  notes: string[];
};

export function convertToBrlCamBio001(input: {
  valor: number;
  moeda: string;
  dataDisponibilidade: string;
  /** Override: BRL per 1 unit of origin currency (fixture / SME). */
  taxaConversaoBrl?: number;
}): CambioResult {
  const notes: string[] = [];
  const moeda = input.moeda.toUpperCase();

  if (moeda === "BRL") {
    return {
      regraId: "BR-CAMBIO-001",
      valorBrl: input.valor,
      taxaAplicada: 1,
      metodo: "identity_brl",
      requiresReview: false,
      notes: ["Amount already in BRL"]
    };
  }

  if (input.taxaConversaoBrl !== undefined && input.taxaConversaoBrl > 0) {
    notes.push(
      "Explicit conversion rate supplied (expected: BACEN buy rate for last business day of first fortnight of prior month)."
    );
    return {
      regraId: "BR-CAMBIO-001",
      valorBrl: round2(input.valor * input.taxaConversaoBrl),
      taxaAplicada: input.taxaConversaoBrl,
      metodo: "explicit",
      requiresReview: false,
      notes
    };
  }

  // Documented proxy: monthly average keyed by the statutory prior month (IN SRF 208/2002).
  const ptax = lookupPtaxToBrl(moeda, input.dataDisponibilidade);
  notes.push(
    "Using documented prior-month PTAX monthly-average proxy (IN SRF 208/2002 fortnight rule approximated) — requiresReview until a live BACEN feed is wired."
  );
  if (ptax === undefined) {
    return {
      regraId: "BR-CAMBIO-001",
      valorBrl: 0,
      taxaAplicada: 0,
      metodo: "ptax_monthly_proxy",
      requiresReview: true,
      notes: [...notes, `No PTAX for ${moeda} on ${input.dataDisponibilidade}; amount excluded from the tax base`]
    };
  }

  return {
    regraId: "BR-CAMBIO-001",
    valorBrl: round2(input.valor * ptax),
    taxaAplicada: ptax,
    metodo: "ptax_monthly_proxy",
    requiresReview: true,
    notes
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
