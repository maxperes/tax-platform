import type { TwinInventory, TwinPersonInput } from "./twin.js";
import { NOT_SURE, type InterviewRecord } from "./interview-record.js";
import {
  collectBrazilStaysFromInterview,
  countPresenceDaysFromStays
} from "./brazil-stays.js";

const ASSET_LABELS: Record<string, string> = {
  bank_accounts: "Bank accounts",
  brokerage: "Brokerage accounts",
  retirement_accounts: "Retirement accounts",
  real_estate: "Real estate",
  foreign_companies: "Foreign companies",
  brazilian_companies: "Brazilian companies",
  trust_interests: "Trust interests",
  crypto_assets: "Cryptocurrency",
  loans_receivable: "Loans receivable",
  other_assets: "Other assets"
};

const DAYS_BAND: Record<string, number> = {
  "0_30": 15,
  "31_90": 60,
  "91_182": 136,
  "183_plus": 200
};

function derivedDaysFromStays(stays: NonNullable<TwinInventory["residency"]["brazilStays"]>): number {
  return countPresenceDaysFromStays(stays);
}

const PATHWAY: Record<string, TwinInventory["residency"]["entryPathway"]> = {
  tourist: "other",
  temporary_visa: "temporary_visa",
  digital_nomad: "digital_nomad",
  work_visa: "temporary_visa",
  retirement_visa: "permanent_visa",
  family_reunion: "family_reunification",
  permanent: "permanent_visa",
  citizen: "returning_brazilian",
  none: "unknown"
};

function asString(record: InterviewRecord, id: string): string | undefined {
  const value = record.answers[id];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoDate(value?: string): string | undefined {
  if (!value || value === NOT_SURE) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function asList(record: InterviewRecord, id: string): string[] {
  const value = record.answers[id];
  return Array.isArray(value) ? value : [];
}

export function countryCodeToIso(value?: string): string {
  if (!value || value === "other" || value === "none") return "US";
  if (value === "uk") return "GB";
  return value.toUpperCase().slice(0, 2);
}

function followAmount(record: InterviewRecord, category: string): number {
  const raw = asString(record, `income_${category}_amount`);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function followCountry(record: InterviewRecord, category: string, fallback: string): string {
  const raw = asString(record, `income_${category}_country`);
  if (raw && raw !== NOT_SURE) return countryCodeToIso(raw);
  return fallback;
}

function followCurrency(record: InterviewRecord, category: string): string {
  const raw = asString(record, `income_${category}_currency`);
  if (raw && raw.length === 3) return raw;
  return "USD";
}

function currencyForCountry(iso: string): string {
  if (iso === "BR") return "BRL";
  if (iso === "GB") return "GBP";
  if (iso === "JP") return "JPY";
  if (iso === "AU") return "AUD";
  if (iso === "CA") return "CAD";
  if (iso === "AR") return "ARS";
  if (["PT", "DE", "FR", "IT", "ES"].includes(iso)) return "EUR";
  return "USD";
}

function followAssetCountry(record: InterviewRecord, assetType: string, fallback: string): string {
  const raw = asString(record, `asset_${assetType}_country`);
  if (raw && raw !== NOT_SURE) return countryCodeToIso(raw);
  if (assetType === "brazilian_companies") return "BR";
  return fallback;
}

function collectBrazilStays(record: InterviewRecord): TwinInventory["residency"]["brazilStays"] {
  return collectBrazilStaysFromInterview(record);
}

function followWithholding(record: InterviewRecord, category: string): number | undefined {
  const raw = asString(record, `income_${category}_withholding`);
  if (!raw || raw === NOT_SURE) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function followPaymentDate(record: InterviewRecord, category: string): string | undefined {
  return isoDate(asString(record, `income_${category}_payment_date`));
}

function treatmentForCategory(category: string, ownsEntities: boolean): TwinInventory["incomes"][number]["brazilianTaxTreatment"] {
  const c = category.toLowerCase();
  if (c.includes("trust")) return "lei_14754_offshore";
  if (c.includes("capital_gain") || c === "crypto") return "capital_gain";
  if (c === "business_distributions" || (ownsEntities && c.includes("distribution"))) {
    return "llc_distribution";
  }
  if (ownsEntities && (c.includes("llc") || c === "self_employment")) return "llc_pass_through";
  if (c.includes("rsu") || c.includes("stock_option")) return "salary_progressive";
  return "salary_progressive";
}

/** Project interview answers into twin inventory + persons (shared by web interview and API sync). */
export function interviewToTwin(record: InterviewRecord): {
  inventory: TwinInventory;
  persons: TwinPersonInput[];
} {
  const citizenship = asString(record, "citizenship");
  const residence = asString(record, "residence_country");
  const filing = asString(record, "last_filing_country");
  const originFallback = countryCodeToIso(residence ?? citizenship ?? "us");
  const days = asString(record, "days_in_brazil");
  const immigration = asString(record, "immigration_status");
  const currentlyInBrazil = asString(record, "currently_in_brazil");
  const selfResidentElsewhere = asString(record, "self_assessed_residency");
  const incomeTypes = asList(record, "income_types");
  const assetTypes = asList(record, "asset_types");

  const footprintCodes = new Set<string>();
  for (const code of [citizenship, residence, filing]) {
    if (code && code !== "none" && code !== NOT_SURE) footprintCodes.add(code);
  }
  footprintCodes.add("br");
  for (const category of incomeTypes) {
    const code = asString(record, `income_${category}_country`);
    if (code && code !== "none" && code !== NOT_SURE) footprintCodes.add(code);
  }
  for (const assetType of assetTypes) {
    const code = asString(record, `asset_${assetType}_country`);
    if (code && code !== "none" && code !== NOT_SURE) footprintCodes.add(code);
  }

  const countryFootprint = Array.from(footprintCodes).map((code) => {
    const iso = countryCodeToIso(code);
    const assetsHere = assetTypes.filter(
      (assetType) => followAssetCountry(record, assetType, originFallback) === iso
    );
    const incomesHere = incomeTypes.filter(
      (category) => followCountry(record, category, originFallback) === iso
    );
    return {
      country: iso,
      hasCitizenship: code === citizenship,
      hasTaxResidency: code === residence || (code === "br" && currentlyInBrazil === "yes"),
      hasPermanentVisa: immigration === "permanent" && code === "br",
      hasCompany: assetsHere.some((t) => t === "foreign_companies" || t === "brazilian_companies"),
      hasInvestments: assetsHere.some((t) => t === "brokerage" || t === "retirement_accounts"),
      hasRealEstate: assetsHere.some((t) => t === "real_estate"),
      hasRetirementIncome: incomesHere.some((t) =>
        ["social_security", "government_pension", "private_pension"].includes(t)
      )
    };
  });

  const incomes = incomeTypes.map((category) => {
    const withholding = followWithholding(record, category);
    const paymentDate = followPaymentDate(record, category);
    const ownsEntities = asString(record, "owns_entities") === "yes";
    const explicitTreatment = asString(record, `income_${category}_treatment`);
    return {
      category,
      originCountry: followCountry(record, category, originFallback),
      currency: followCurrency(record, category),
      annualAmount: followAmount(record, category),
      taxPaidOrigin: withholding,
      withholdingTax: withholding,
      paymentDate,
      brazilianTaxTreatment:
        explicitTreatment === "salary_progressive" ||
        explicitTreatment === "llc_pass_through" ||
        explicitTreatment === "llc_distribution" ||
        explicitTreatment === "capital_gain" ||
        explicitTreatment === "lei_14754_offshore" ||
        explicitTreatment === "definitive_withholding" ||
        explicitTreatment === "reporting_only" ||
        explicitTreatment === "unknown"
          ? explicitTreatment
          : treatmentForCategory(category, ownsEntities)
    };
  });

  const assets = assetTypes.map((assetType) => {
    const country = followAssetCountry(record, assetType, originFallback);
    return {
      name: ASSET_LABELS[assetType] ?? assetType,
      assetType,
      country,
      currency: currencyForCountry(country)
    };
  });

  const ownsEntities = asString(record, "owns_entities") === "yes";
  const entities =
    ownsEntities || assetTypes.includes("foreign_companies") || assetTypes.includes("brazilian_companies")
      ? [
          {
            name: assetTypes.includes("brazilian_companies")
              ? "Brazilian company interest"
              : "Foreign company interest",
            entityType: "company",
            country: assetTypes.includes("brazilian_companies")
              ? followAssetCountry(record, "brazilian_companies", "BR")
              : followAssetCountry(record, "foreign_companies", originFallback)
          }
        ]
      : [];
  const trusts =
    ownsEntities || assetTypes.includes("trust_interests")
      ? [
          {
            name: "Trust interest",
            jurisdiction: followAssetCountry(record, "trust_interests", originFallback),
            trustType: "other" as const
          }
        ]
      : [];

  const brazilStays = collectBrazilStays(record);
  const firstEntry = brazilStays?.[0]?.entryDate ?? isoDate(asString(record, "first_entry_date"));
  const derivedDays = brazilStays ? derivedDaysFromStays(brazilStays) : undefined;
  const legacyDays = days && days !== NOT_SURE ? DAYS_BAND[days] : undefined;

  const inventory: TwinInventory = {
    residency: {
      firstEntryBrazilDate: firstEntry,
      entryPathway:
        immigration && immigration !== NOT_SURE ? PATHWAY[immigration] ?? "unknown" : "unknown",
      daysInBrazilCalendarYear: derivedDays ?? legacyDays,
      brazilStays,
      physicallyLivesInBrazil:
        currentlyInBrazil === "yes" ? true : currentlyInBrazil === "no" ? false : undefined,
      currentlyFiscalResidentBrazil: undefined,
      currentlyFiscalResidentUSA: residence === "us" || citizenship === "us",
      otherFiscalResidencies:
        selfResidentElsewhere === "yes" && residence && residence !== "us" && residence !== "br"
          ? [countryCodeToIso(residence)]
          : undefined,
      priorPermanentExitBrazil: asString(record, "filed_departure_declaration") === "yes"
    },
    countryFootprint,
    incomes,
    assets,
    entities,
    trusts,
    financialAccountsSummary: assetTypes.filter((t) =>
      ["bank_accounts", "brokerage", "retirement_accounts"].includes(t)
    )
  };

  const name = asString(record, "full_name") || "Primary taxpayer";
  const persons: TwinPersonInput[] = [
    {
      fullName: name,
      role: "primary",
      livesInCountry: countryCodeToIso(residence ?? "us"),
      hasIncome: incomeTypes.length > 0,
      hasWealth: assetTypes.length > 0,
      hasInvestments: assetTypes.some((t) =>
        ["brokerage", "retirement_accounts", "crypto_assets"].includes(t)
      )
    }
  ];

  return { inventory, persons };
}
