import type { PublicCaseFixture } from "./types.js";

const RFB_PR_IRPF_2026_Q140_URL =
  "https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf";

const RFB_Q140_SOURCE = {
  citation: "RFB Perguntas e Respostas IRPF 2026, pergunta 140 (Imposto pago no exterior — compensação/conversão)",
  url: RFB_PR_IRPF_2026_Q140_URL,
  retrievedAt: "2026-08-16"
} as const;

/**
 * RFB Q140 Example 1 — Germany-source income; FX and full foreign-tax credit.
 * Impact Twin stores already-converted BRL (To Be does not run PTAX).
 * Published annual with/without (R$ 32,100 / R$ 19,000) include other BR income and are credit inputs only.
 */
export const rfbPrIrpf2026Q140Ex1: PublicCaseFixture = {
  id: "rfb-pr-irpf-2026-q140-ex1-germany",
  title: "RFB P&R IRPF 2026 Q140 Example 1 — Germany foreign tax credit (full)",
  source: RFB_Q140_SOURCE,
  limitations: [
    "RFB states the FX quotes in this example are fictitious.",
    "Published annual BR tax with/without (R$ 32,100 / R$ 19,000) includes other Brazilian income not in this Twin; used only as credit-limit inputs.",
    "Impact Assessment applies the 2026 annual table to already-converted BRL; it does not reproduce the 2023 DAA figures.",
    "No taxpayer identity is published; person name is a placeholder."
  ],
  twin: {
    hypothesisResidencyDate: "2026-01-01",
    plan: "basic",
    persons: [{ fullName: "Public Case Primary", role: "primary", livesInCountry: "BR" }],
    inventory: {
      residency: {
        currentlyFiscalResidentBrazil: true,
        firstEntryBrazilDate: "2020-01-01"
      },
      countryFootprint: [
        { country: "BR", hasTaxResidency: true, hasCitizenship: true },
        { country: "DE", hasTaxResidency: false }
      ],
      incomes: [
        {
          category: "salary",
          payerName: "German-source payer",
          originCountry: "DE",
          periodicity: "one_off",
          currency: "BRL",
          annualAmount: 52695,
          taxPaidOrigin: 5269.5,
          notes:
            "Already converted at RFB Q140 fictitious PTAX 5.2695 (US$ 10,000 on 2023-06-17). Impact layer does not run PTAX."
        }
      ],
      assets: [],
      entities: [],
      trusts: [],
      financialAccountsSummary: []
    }
  },
  expectedImpact: {
    sectionCount: 4,
    requiredObligations: ["IRPF", "CARNE_LEAO"],
    categoryTaxability: { salary: "taxable_br" },
    residencyMethod: "already_resident",
    grossTaxBaseBrl: 52695
  },
  legal: {
    irpfExt: {
      dataInicioResidenciaBr: "2020-01-01",
      itens: [
        {
          id: "de-salary",
          natureza: "trabalho",
          paisFonte: "DE",
          dataDisponibilidade: "2023-06-17",
          moeda: "USD",
          valorBruto: 10_000,
          impostoPagoExterior: 1_000,
          taxaConversaoBrl: 5.2695
        }
      ]
    },
    expectedIncidence: "incide",
    fx: {
      valor: 10_000,
      moeda: "USD",
      dataDisponibilidade: "2023-06-17",
      taxaConversaoBrl: 5.2695,
      expectedValorBrl: 52_695
    },
    credit: {
      impostoBrasileiroComRendimento: 32_100,
      impostoBrasileiroSemRendimento: 19_000,
      impostoPagoExteriorBrl: 5_269.5,
      expectedLimiteCreditoBrl: 13_100,
      expectedCreditoAplicadoBrl: 5_269.5,
      reciprocidadeReconhecida: true
    }
  }
};

/**
 * RFB Q140 Example 2 — France-source income; foreign tax exceeds the BR marginal limit.
 * Legal-only (no Twin): covers the credit-cap path.
 */
export const rfbPrIrpf2026Q140Ex2: PublicCaseFixture = {
  id: "rfb-pr-irpf-2026-q140-ex2-france",
  title: "RFB P&R IRPF 2026 Q140 Example 2 — France foreign tax credit (capped)",
  source: RFB_Q140_SOURCE,
  limitations: [
    "RFB states the FX quotes in this example are fictitious.",
    "Published annual BR tax with/without (R$ 5,900 / R$ 2,000) includes other Brazilian income not modeled here.",
    "Legal-only fixture: no Twin / Impact Assessment replay."
  ],
  legal: {
    fx: {
      valor: 4_400,
      moeda: "USD",
      dataDisponibilidade: "2023-09-24",
      taxaConversaoBrl: 5.2468,
      expectedValorBrl: 23_085.92
    },
    credit: {
      impostoBrasileiroComRendimento: 5_900,
      impostoBrasileiroSemRendimento: 2_000,
      impostoPagoExteriorBrl: 7_870.2,
      expectedLimiteCreditoBrl: 3_900,
      expectedCreditoAplicadoBrl: 3_900,
      reciprocidadeReconhecida: true
    }
  }
};
