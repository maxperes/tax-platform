import type { ProgressiveRow } from "../../progressive.js";
import type { DataPackMeta } from "../pack-meta.js";

/**
 * BR statutory tables for tax year 2026 (data pack br-2026-1).
 * Monthly Carnê-Leão / withholding progression aligned to RFB 2024 monthly table
 * until RFB publishes 2026-specific values — confirm with tax SME before production.
 * @see https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda (tabela progressiva mensal)
 */
export const BR_DATA_PACK_ID = "br-2026-1";

/** SME governance metadata — see docs/tax-rules-governance.md */
export const BR_DATA_PACK_META: DataPackMeta = {
  taxYear: 2026,
  dataPackId: BR_DATA_PACK_ID,
  jurisdiction: "BR",
  sources: [
    "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda"
  ],
  smeReviewRequired: true,
  lastValidatedAt: null,
  validatedBy: null,
  notes: "Monthly/annual tables use RFB 2024-style values until CY2026 tables are published."
};

/**
 * IRPF-style monthly progressive used by legacy carnê-leão engine.
 * BR-IRPF-EXT-001 uses vigência-dated table in
 * `legal/matriz/tables/br-irpf-mensal-2025-05.ts` — migrate callers when SME signs off.
 */
export const BR_IRPF_MONTHLY_2026: ProgressiveRow[] = [
  { upperBound: 2259.2, rate: 0, deduction: 0 },
  { upperBound: 2826.65, rate: 0.075, deduction: 169.44 },
  { upperBound: 3751.05, rate: 0.15, deduction: 381.44 },
  { upperBound: 4664.68, rate: 0.225, deduction: 662.77 },
  { upperBound: Number.POSITIVE_INFINITY, rate: 0.275, deduction: 896.0 }
];

/** Annual IRPF progression (RFB 2024-style annual limits; confirm for CY2026). */
export const BR_IRPF_ANNUAL_2026: ProgressiveRow[] = [
  { upperBound: 28559.7, rate: 0, deduction: 0 },
  { upperBound: 37710.53, rate: 0.15, deduction: 4270.78 },
  { upperBound: 50138.66, rate: 0.225, deduction: 7083.88 },
  { upperBound: 66641.88, rate: 0.275, deduction: 9585.41 },
  { upperBound: Number.POSITIVE_INFINITY, rate: 0.275, deduction: 9585.41 }
];

/** Capital gain on financial assets — graduated slices (simplified annual disposal). */
export const BR_CAPITAL_GAIN_SLICES = [
  { width: 1_000_000, rate: 0.15 },
  { width: 4_000_000, rate: 0.175 },
  { width: 5_000_000, rate: 0.2 },
  { width: 20_000_000, rate: 0.225 },
  { width: Number.POSITIVE_INFINITY, rate: 0.225 }
];

/** Optional 15% regime on foreign dividends (Lei 14.754) — eligibility is classification-only. */
export const BR_LEI_14754_RATE = 0.15;

export type BrRulePack2026 = {
  dataPackId: string;
  monthly: ProgressiveRow[];
  annual: ProgressiveRow[];
  capitalGainSlices: { width: number; rate: number }[];
  lei14754Rate: number;
};

export const brRulePack2026: BrRulePack2026 = {
  dataPackId: BR_DATA_PACK_ID,
  monthly: BR_IRPF_MONTHLY_2026,
  annual: BR_IRPF_ANNUAL_2026,
  capitalGainSlices: BR_CAPITAL_GAIN_SLICES,
  lei14754Rate: BR_LEI_14754_RATE
};
