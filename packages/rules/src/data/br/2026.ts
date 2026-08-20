import type { ProgressiveRow } from "../../progressive.js";
import { annualizeMonthlyProgressiveTable } from "../../progressive.js";
import type { DataPackMeta } from "../pack-meta.js";
import { BR_IRPF_MENSAL_2025_05 } from "../../legal/matriz/tables/br-irpf-mensal-2025-05.js";

/**
 * BR statutory tables for tax year 2026 (data pack br-2026-1).
 * Monthly + annual IRPF bands are the single matriz vigência table
 * (`BR-IRPF-MENSAL-2025-05`); annual = monthly × 12.
 * Confirm with tax SME before production.
 * @see https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda
 */
export const BR_DATA_PACK_ID = "br-2026-1";

/** SME governance metadata — see docs/tax-rules-governance.md */
export const BR_DATA_PACK_META: DataPackMeta = {
  taxYear: 2026,
  dataPackId: BR_DATA_PACK_ID,
  jurisdiction: "BR",
  sources: [
    "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda",
    "packages/rules/src/legal/matriz/tables/br-irpf-mensal-2025-05.ts"
  ],
  smeReviewRequired: true,
  lastValidatedAt: null,
  validatedBy: null,
  notes:
    "Monthly IRPF/carnê-leão is BR-IRPF-MENSAL-2025-05 (vigência 2025-05-01). Annual bands are monthly × 12. Still requires SME sign-off for CY2026 publication."
};

/** Same array as the legal matriz monthly table — do not fork. */
export const BR_IRPF_MONTHLY_2026: ProgressiveRow[] = BR_IRPF_MENSAL_2025_05;

/** Annual IRPF progression derived from the monthly vigência table. */
export const BR_IRPF_ANNUAL_2026: ProgressiveRow[] = annualizeMonthlyProgressiveTable(BR_IRPF_MONTHLY_2026);

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
