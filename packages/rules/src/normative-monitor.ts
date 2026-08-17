/**
 * Normative monitoring scaffold (Phase 3).
 * P0 exposes status + watched sources; no live crawlers yet.
 */

export type NormativeSourceWatch = {
  id: string;
  jurisdiction: "BR" | "US" | "INTL";
  label: string;
  category: string;
  pollHint: string;
  lastCheckedAt: string | null;
  status: "not_configured" | "manual_sme" | "active";
};

export const NORMATIVE_WATCHLIST: NormativeSourceWatch[] = [
  {
    id: "br-congresso",
    jurisdiction: "BR",
    label: "Congresso Nacional (PL / PEC / MP)",
    category: "legislature",
    pollHint: "Manual SME review until crawler enabled",
    lastCheckedAt: null,
    status: "manual_sme"
  },
  {
    id: "br-rfb-in",
    jurisdiction: "BR",
    label: "Receita Federal — INs / COSIT / Q&A IRPF",
    category: "tax_admin",
    pollHint: "Track IN RFB and Soluções de Consulta COSIT",
    lastCheckedAt: null,
    status: "manual_sme"
  },
  {
    id: "br-dou",
    jurisdiction: "BR",
    label: "Diário Oficial da União",
    category: "official_gazette",
    pollHint: "Legal change publication",
    lastCheckedAt: null,
    status: "not_configured"
  },
  {
    id: "br-carf",
    jurisdiction: "BR",
    label: "CARF acórdãos (CFC / tratados / compensações)",
    category: "jurisprudence",
    pollHint: "Manual thematic review",
    lastCheckedAt: null,
    status: "manual_sme"
  },
  {
    id: "br-bacen",
    jurisdiction: "BR",
    label: "BACEN — CBE / câmbio / capitais",
    category: "central_bank",
    pollHint: "Threshold and form updates",
    lastCheckedAt: null,
    status: "manual_sme"
  },
  {
    id: "us-irs",
    jurisdiction: "US",
    label: "IRS / Treasury / FinCEN (FBAR, FATCA, FTC)",
    category: "foreign_tax_admin",
    pollHint: "Origin-country rules for US clients",
    lastCheckedAt: null,
    status: "manual_sme"
  }
];

export function getNormativeMonitorStatus(): {
  mode: "scaffold";
  message: string;
  sources: NormativeSourceWatch[];
} {
  return {
    mode: "scaffold",
    message:
      "Automated normative monitoring is not enabled. Legal rule packs are updated via SME review and data-pack releases.",
    sources: NORMATIVE_WATCHLIST
  };
}
