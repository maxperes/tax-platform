import { taxFromProgressiveTable } from "../progressive.js";
import { graduatedCapitalGainTax } from "./br.js";
import type { BrRulePack2026 } from "../data/br/2026.js";
import type { TreatmentResolution } from "./income-treatment.js";

export type GrossRegime = "irpf_progressive" | "gcap" | "lei_14754" | "none";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map To Be treatment onto the BR tax regime used for headline gross tax. */
export function grossRegimeFor(resolved: TreatmentResolution, inBase: boolean): GrossRegime {
  if (!inBase) return "none";
  if (resolved.taxability === "reporting_only") return "none";
  if (resolved.regimeBrasileiro === "ganho_capital" || resolved.treatment === "capital_gain") {
    return "gcap";
  }
  if (
    resolved.regimeBrasileiro === "lei_14754_offshore" ||
    resolved.treatment === "lei_14754_offshore" ||
    resolved.treatment === "llc_distribution"
  ) {
    return "lei_14754";
  }
  if (
    resolved.regimeBrasileiro === "tributacao_definitiva" ||
    resolved.treatment === "definitive_withholding"
  ) {
    return "none";
  }
  if (resolved.taxability === "taxable_br" || resolved.taxability === "complex") {
    return "irpf_progressive";
  }
  return "none";
}

export function allocateByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const rounded = raw.map(round2);
  const drift = round2(total - rounded.reduce((s, n) => s + n, 0));
  if (rounded.length > 0 && drift !== 0) {
    const maxIdx = weights.reduce((best, w, i) => (w > weights[best]! ? i : best), 0);
    rounded[maxIdx] = round2(rounded[maxIdx]! + drift);
  }
  return rounded;
}

/**
 * Gross BR tax on a converted, aggregated base — one progressive table pass per regime,
 * never per-line original-currency amounts.
 */
export function computeAggregatedGrossBrTax(input: {
  amountBrlByLine: number[];
  regimeByLine: GrossRegime[];
  pack: BrRulePack2026;
}): {
  irpfTax: number;
  gcapTax: number;
  leiTax: number;
  total: number;
  taxByLine: number[];
} {
  const irpfIdx: number[] = [];
  const gcapIdx: number[] = [];
  const leiIdx: number[] = [];
  input.regimeByLine.forEach((regime, i) => {
    if (regime === "irpf_progressive") irpfIdx.push(i);
    else if (regime === "gcap") gcapIdx.push(i);
    else if (regime === "lei_14754") leiIdx.push(i);
  });

  const irpfBase = round2(irpfIdx.reduce((s, i) => s + input.amountBrlByLine[i]!, 0));
  const gcapBase = round2(gcapIdx.reduce((s, i) => s + input.amountBrlByLine[i]!, 0));
  const leiBase = round2(leiIdx.reduce((s, i) => s + input.amountBrlByLine[i]!, 0));

  const irpfTax = round2(taxFromProgressiveTable(irpfBase, input.pack.annual));
  const gcapTax = round2(graduatedCapitalGainTax(gcapBase, input.pack).tax);
  const leiTax = round2(leiBase * input.pack.lei14754Rate);

  const taxByLine = input.amountBrlByLine.map(() => 0);
  const irpfAlloc = allocateByWeight(
    irpfTax,
    irpfIdx.map((i) => input.amountBrlByLine[i]!)
  );
  irpfIdx.forEach((i, k) => {
    taxByLine[i] = irpfAlloc[k]!;
  });
  const gcapAlloc = allocateByWeight(
    gcapTax,
    gcapIdx.map((i) => input.amountBrlByLine[i]!)
  );
  gcapIdx.forEach((i, k) => {
    taxByLine[i] = gcapAlloc[k]!;
  });
  const leiAlloc = allocateByWeight(
    leiTax,
    leiIdx.map((i) => input.amountBrlByLine[i]!)
  );
  leiIdx.forEach((i, k) => {
    taxByLine[i] = leiAlloc[k]!;
  });

  return {
    irpfTax,
    gcapTax,
    leiTax,
    total: round2(irpfTax + gcapTax + leiTax),
    taxByLine
  };
}
