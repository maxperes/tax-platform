import type { LegalRule } from "@tax-platform/shared";
import { LEGAL_RULE_PACK_BR_2026 } from "@tax-platform/shared";

/** Cite-backed legal rules for BR Impact Assessment (SME review required before production). */
export const LEGAL_RULE_PACK_ID = LEGAL_RULE_PACK_BR_2026;

export const brLegalRules2026: LegalRule[] = [
  {
    id: "BR-IRPF-EXT-001",
    title: "IRPF on foreign-source income of Brazilian tax resident",
    jurisdiction: "BR",
    sources: [
      { kind: "ctn", citation: "CTN, art. 43" },
      { kind: "lei", citation: "Lei 7.713/1988, arts. 1º a 3º" },
      { kind: "lei", citation: "Lei 9.250/1995" },
      { kind: "rir", citation: "RIR/2018 (Dec. 9.580/2018)" },
      { kind: "in_rfb", citation: "IN SRF 208/2002" },
      { kind: "in_rfb", citation: "IN RFB 1.500/2014" }
    ],
    effectiveFrom: "2025-05-01",
    hypothesis:
      "Brazilian tax resident receives foreign-source income not subject to Brazilian definitive withholding — progressive IRPF / carnê-leão with optional foreign tax credit.",
    exceptions: [
      "Income before residency start (fora_do_campo)",
      "Lei 14.754 offshore / trusts (separate catalog)",
      "Capital gains abroad (GCAP)",
      "Contested: moléstia grave / over-65 parcel on foreign pensions"
    ],
    requirements: [
      "BR-RESID-001 residency on availability date",
      "BR-CAMBIO-001 conversion",
      "Availability date (not remittance)",
      "Ownership share"
    ],
    certaintyTier: "high",
    dependsOnCosit: true,
    tags: ["taxability", "worldwide", "irpf-ext", "carne-leao", "BR-IRPF-EXT-001"]
  },
  {
    id: "BR-RESID-001",
    title: "Brazilian tax residency — 183-day rolling presence",
    jurisdiction: "BR",
    sources: [
      {
        kind: "lei",
        citation: "Lei 9.718/1998 and RIR/2018 residence rules"
      },
      {
        kind: "rir",
        citation: "RIR/2018 (Dec. 9.580/2018) — caracterização de residente"
      }
    ],
    effectiveFrom: "1999-01-01",
    hypothesis:
      "Individual who remains in Brazil for more than 183 days, consecutive or not, within any period of up to 12 months may become a tax resident on the 184th day of presence in that window (absent a permanent-visa or returning-Brazilian pathway).",
    exceptions: ["Specific treaty tie-breaker may override for treaty residents", "Permanent visa / family pathway starts on grant or entry"],
    requirements: ["Day-level entry and exit history", "Evaluate visa pathway"],
    certaintyTier: "high",
    dependsOnCosit: false,
    tags: ["residency", "183-days", "BR-RESID-001"]
  },
  {
    id: "br-residency-permanent-visa",
    title: "Brazilian tax residency — permanent visa / RNM pathway",
    jurisdiction: "BR",
    sources: [
      { kind: "in_rfb", citation: "IN RFB — residente a partir da data da obtenção do visto permanente" },
      { kind: "lei", citation: "RIR / normas de residência fiscal" }
    ],
    effectiveFrom: "1999-01-01",
    hypothesis: "Holder of permanent visa or equivalent becomes Brazilian tax resident from the grant date.",
    exceptions: [],
    requirements: ["Document visa/RNM grant date"],
    certaintyTier: "very_high",
    dependsOnCosit: false,
    tags: ["residency", "permanent-visa"]
  },
  {
    id: "br-residency-returning-brazilian",
    title: "Returning Brazilian — residency on reentry",
    jurisdiction: "BR",
    sources: [{ kind: "in_rfb", citation: "IN RFB — brasileiro que retorna ao País" }],
    effectiveFrom: "1999-01-01",
    hypothesis: "Brazilian national returning to Brazil may acquire tax residency from the date of return under applicable IN.",
    exceptions: ["Prior saída definitiva timing interacts with recharacterization"],
    requirements: ["Confirm nationality", "Entry date", "Prior permanent exit status"],
    certaintyTier: "high",
    dependsOnCosit: true,
    tags: ["residency", "returning-brazilian"]
  },
  {
    id: "br-residency-vital-interests",
    title: "Brazilian tax residency — center of vital interests / substance",
    jurisdiction: "BR",
    sources: [
      {
        kind: "jurisprudence_carf",
        citation: "CARF Acórdão 2201-011.434 (center of vital interests; Brazil–Paraguay treaty tie-breaker)"
      },
      { kind: "ctn", citation: "CTN, art. 127" }
    ],
    effectiveFrom: "1966-10-25",
    hypothesis:
      "Claimed foreign tax residency does not by itself displace Brazilian tax residence when personal and economic ties (electoral domicile, bank accounts, real estate, DIRPF address) remain centered in Brazil.",
    exceptions: ["Robust contemporaneous proof of life abroad may support non-residency in other CARF precedents"],
    requirements: ["Claimed foreign residency", "Brazil vital-interest indicators"],
    certaintyTier: "medium",
    dependsOnCosit: true,
    tags: ["residency", "vital-interests"]
  },
  {
    id: "br-worldwide-income",
    title: "Brazilian tax resident — worldwide income principle",
    jurisdiction: "BR",
    sources: [
      { kind: "constitution", citation: "CF — competência IR" },
      { kind: "rir", citation: "RIR — rendimentos de residente" }
    ],
    effectiveFrom: "1988-10-05",
    hypothesis: "Brazilian tax residents are taxed on worldwide income.",
    exceptions: [],
    requirements: ["Confirmed Brazilian tax residency"],
    certaintyTier: "very_high",
    dependsOnCosit: false,
    tags: ["taxability", "worldwide"]
  },
  {
    id: "br-ssa-taxability",
    title: "Foreign Social Security / pension income taxability",
    jurisdiction: "BR",
    sources: [
      { kind: "rir", citation: "RIR — proventos de aposentadoria" },
      { kind: "cosit", citation: "COSIT solutions on foreign pensions (case-specific)" }
    ],
    effectiveFrom: "1999-01-01",
    hypothesis: "Foreign retirement / SSA-like benefits received by a BR resident are generally taxable unless a specific exemption applies.",
    exceptions: ["Moléstia grave and other statutory exemptions", "Treaty pension articles"],
    requirements: ["Characterize benefit type", "Check exemption eligibility separately"],
    certaintyTier: "high",
    dependsOnCosit: true,
    tags: ["taxability", "social_security", "pension"]
  },
  {
    id: "br-ftc-reciprocity",
    title: "Foreign tax credit / reciprocity (US–BR)",
    jurisdiction: "BR",
    sources: [
      { kind: "lei", citation: "ADI SRF 28/2000 style reciprocity path (SME confirm)" },
      { kind: "other", citation: "No comprehensive US–BR income tax treaty" }
    ],
    effectiveFrom: "2000-01-01",
    hypothesis:
      "Tax paid in the US may be credited against Brazilian IR under reciprocity rules when requirements are met; there is no full US–BR double tax treaty.",
    exceptions: ["Credit limits", "Character of income", "Proof of foreign tax paid"],
    requirements: ["Proof of foreign tax", "Same income taxed in BR"],
    certaintyTier: "medium",
    dependsOnCosit: true,
    tags: ["ftc", "treaty", "double-tax"]
  },
  {
    id: "br-obligation-irpf",
    title: "IRPF filing obligation for residents",
    jurisdiction: "BR",
    sources: [{ kind: "in_rfb", citation: "IN RFB — obrigatoriedade de entrega da DIRPF" }],
    effectiveFrom: "1999-01-01",
    hypothesis: "Brazilian tax residents meeting income/asset thresholds must file IRPF.",
    exceptions: ["Threshold exceptions per annual IN"],
    requirements: ["Residency confirmed"],
    certaintyTier: "very_high",
    dependsOnCosit: false,
    tags: ["obligation", "irpf"]
  },
  {
    id: "br-obligation-carne-leao",
    title: "Carnê-leão on foreign-source income",
    jurisdiction: "BR",
    sources: [{ kind: "in_rfb", citation: "IN RFB — carnê-leão" }],
    effectiveFrom: "1999-01-01",
    hypothesis: "Residents receiving foreign-source income without Brazilian withholding may owe monthly carnê-leão.",
    exceptions: ["Income subject to other definitive regimes"],
    requirements: ["Foreign income streams"],
    certaintyTier: "high",
    dependsOnCosit: false,
    tags: ["obligation", "carne-leao"]
  },
  {
    id: "br-obligation-gcap",
    title: "GCAP on capital gains",
    jurisdiction: "BR",
    sources: [{ kind: "lei", citation: "Normas de ganho de capital / GCAP" }],
    effectiveFrom: "1999-01-01",
    hypothesis: "Alienation of assets by residents may require GCAP calculation and payment.",
    exceptions: ["Exempt disposals"],
    requirements: ["Asset disposal events"],
    certaintyTier: "high",
    dependsOnCosit: false,
    tags: ["obligation", "gcap"]
  },
  {
    id: "br-lei-14754-cfc",
    title: "Lei 14.754/2023 — foreign controlled entities / financial investments abroad",
    jurisdiction: "BR",
    sources: [{ kind: "lei", citation: "Lei 14.754/2023" }],
    effectiveFrom: "2024-01-01",
    hypothesis:
      "Residents with foreign controlled entities or certain foreign financial investments may face annual taxation under Lei 14.754 regimes.",
    exceptions: ["Election regimes", "Thresholds", "Trust characterization"],
    requirements: ["Ownership/control facts", "Entity classification"],
    certaintyTier: "medium",
    dependsOnCosit: true,
    tags: ["cfc", "lei-14754", "obligation", "taxability"]
  },
    {
      id: "br-obligation-darf",
      title: "DARF payment when carnê-leão or GCAP tax is due",
      jurisdiction: "BR",
      sources: [{ kind: "in_rfb", citation: "IN RFB — recolhimento via DARF / Sicalc" }],
      effectiveFrom: "1999-01-01",
      hypothesis: "Tax due under carnê-leão or GCAP is paid by DARF for the relevant competence.",
      exceptions: ["Amounts below collection minimums"],
      requirements: ["Computed tax due"],
      certaintyTier: "high",
      dependsOnCosit: false,
      tags: ["obligation", "darf"]
    },
    {
      id: "br-obligation-exit",
      title: "Declaração de saída definitiva",
      jurisdiction: "BR",
      sources: [{ kind: "in_rfb", citation: "IN RFB — declaração de saída definitiva do país" }],
      effectiveFrom: "1999-01-01",
      hypothesis: "A Brazilian tax resident who leaves permanently must evaluate the saída definitiva declaration.",
      exceptions: ["Already filed", "Never became resident"],
      requirements: ["Residency history", "Departure facts"],
      certaintyTier: "high",
      dependsOnCosit: false,
      tags: ["obligation", "exit-declaration"]
    },
    {
      id: "br-bacen-cbe",
      title: "BACEN CBE / capital declaration when thresholds met",
      jurisdiction: "BR",
      sources: [{ kind: "other", citation: "BACEN — Declaração de Capitais Brasileiros no Exterior (CBE)" }],
      effectiveFrom: "2000-01-01",
      hypothesis: "Brazilian residents with foreign assets above BACEN thresholds must file CBE.",
      exceptions: ["Threshold not met"],
      requirements: ["Aggregate foreign asset values"],
      certaintyTier: "high",
      dependsOnCosit: false,
      tags: ["obligation", "cbe", "bacen"]
    },
  {
    id: "br-declaration-bens",
    title: "Bens e direitos — worldwide assets on IRPF",
    jurisdiction: "BR",
    sources: [{ kind: "in_rfb", citation: "IN / manual IRPF — ficha Bens e Direitos" }],
    effectiveFrom: "1999-01-01",
    hypothesis: "Residents must declare worldwide assets and rights on IRPF when filing.",
    exceptions: [],
    requirements: ["IRPF filing obligation"],
    certaintyTier: "very_high",
    dependsOnCosit: false,
    tags: ["declaration", "assets"]
  }
];

export function getBrLegalRules(): LegalRule[] {
  return brLegalRules2026;
}
