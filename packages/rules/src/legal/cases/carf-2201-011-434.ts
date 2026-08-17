import type { PublicCaseFixture } from "./types.js";

/**
 * Anonymized reconstruction of CARF Acórdão 2201-011.434.
 * Taxpayer claimed Paraguay residence; Brazil vital-interest ties remained.
 * Income amount is a structural placeholder — the auto de infração is not a target.
 */
export const carf2201011434: PublicCaseFixture = {
  id: "carf-2201-011-434-paraguay-vital-interests",
  title: "CARF 2201-011.434 — claimed Paraguay residency with Brazil vital-interest ties",
  source: {
    citation: "CARF Acórdão nº 2201-011.434 (2ª Câmara / 1ª Turma Ordinária da 2ª Seção)",
    url: "https://www.baptista.com.br/acordao-no-2201-011-434-do-carf-define-criterios-para-caracterizacao-de-domicilio-fiscal/",
    retrievedAt: "2026-08-16"
  },
  limitations: [
    "Facts reconstructed from public commentary on the acórdão; the full administrative file is not in this repo.",
    "Does not assert the auto de infração amount (~R$ 1.6M including penalties) or 2023/2024 DIRPF tax.",
    "Does not auto-decide the CARF holding as already_resident; expected result is review + vital_interests_brazil risk under a BR-residency hypothesis.",
    "Rural income amount is a structural placeholder, not published in the acórdão.",
    "Taxpayer identity is omitted."
  ],
  twin: {
    hypothesisResidencyDate: "2026-01-01",
    plan: "basic",
    persons: [{ fullName: "Public Case Primary", role: "primary", livesInCountry: "PY" }],
    inventory: {
      residency: {
        currentlyFiscalResidentBrazil: false,
        claimedForeignResidencyCountry: "PY",
        priorPermanentExitBrazil: true,
        hasElectoralDomicileBrazil: true,
        filesDirpfWithBrazilAddress: true,
        maintainsBrazilBankAccounts: true,
        acquiredBrazilRealEstateAfterClaimedExit: true,
        otherFiscalResidencies: ["PY"]
      },
      countryFootprint: [
        {
          country: "PY",
          hasTaxResidency: true,
          hasDomicile: true
        },
        {
          country: "BR",
          hasTaxResidency: false,
          hasCitizenship: true,
          hasRealEstate: true,
          hasInvestments: true
        }
      ],
      incomes: [
        {
          category: "rural",
          originCountry: "PY",
          periodicity: "annual",
          currency: "BRL",
          annualAmount: 100_000,
          notes: "Structural placeholder — amount not published in the acórdão."
        }
      ],
      assets: [
        {
          name: "Brazil real estate",
          assetType: "real_estate",
          country: "BR",
          notes: "Acquired while claiming foreign tax residency (public commentary)."
        }
      ],
      entities: [],
      trusts: [],
      financialAccountsSummary: ["Brazil bank accounts"]
    }
  },
  expectedImpact: {
    sectionCount: 4,
    requiredObligations: ["IRPF", "CARNE_LEAO"],
    categoryTaxability: { rural: "taxable_br" },
    requiredRisks: ["vital_interests_brazil"],
    requiresAdditionalReview: true,
    residencyMethod: "undetermined"
  }
};
