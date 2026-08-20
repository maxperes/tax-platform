import type { FiscalResidence } from "./fiscal-residence.js";
import type { IncomeSource } from "./income.js";
import {
  NOT_SURE,
  emptyInterviewRecord,
  type InterviewAnswers,
  type InterviewRecord
} from "./interview-record.js";
import { syncBrazilStaysToInterviewAnswers } from "./brazil-stays.js";

const INTERVIEW_COUNTRIES = new Set([
  "us",
  "br",
  "pt",
  "uk",
  "ca",
  "de",
  "fr",
  "it",
  "es",
  "ar",
  "jp",
  "au"
]);

const IMMIGRATION_IMPLIES_PERMIT = new Set([
  "temporary_visa",
  "digital_nomad",
  "work_visa",
  "retirement_visa",
  "family_reunion",
  "permanent",
  "citizen"
]);

const INCOME_TYPE_MAP: Record<string, string> = {
  salary: "salary",
  wages: "salary",
  employment: "salary",
  business: "self_employment",
  consulting: "self_employment",
  freelance: "self_employment",
  self_employment: "self_employment",
  social_security: "social_security",
  military_pension: "government_pension",
  government_pension: "government_pension",
  pension: "private_pension",
  "401k": "private_pension",
  ira: "private_pension",
  roth_ira: "private_pension",
  annuity: "private_pension",
  private_pension: "private_pension",
  dividends: "dividends",
  interest: "interest",
  capital_gain: "capital_gains",
  capital_gains: "capital_gains",
  rental: "rental",
  airbnb: "rental",
  stock_options: "stock_options",
  rsu: "rsus",
  rsus: "rsus",
  espp: "stock_options",
  trust_distribution: "trust",
  trust: "trust",
  crypto: "crypto",
  staking: "crypto",
  nft: "crypto",
  yield_farming: "crypto",
  royalties: "other_income",
  other: "other_income",
  other_income: "other_income",
  distributions: "business_distributions",
  business_distributions: "business_distributions"
};

const NATURE_FALLBACK: Record<string, string> = {
  work: "salary",
  investment: "dividends",
  retirement: "private_pension",
  asset: "rental",
  corporate: "business_distributions",
  trust: "trust",
  other: "other_income"
};

const ASSET_TYPE_MAP: Record<string, string> = {
  bank: "bank_accounts",
  bank_account: "bank_accounts",
  bank_accounts: "bank_accounts",
  checking: "bank_accounts",
  savings: "bank_accounts",
  brokerage: "brokerage",
  investment_account: "brokerage",
  securities: "brokerage",
  retirement: "retirement_accounts",
  retirement_account: "retirement_accounts",
  retirement_accounts: "retirement_accounts",
  "401k": "retirement_accounts",
  ira: "retirement_accounts",
  real_estate: "real_estate",
  property: "real_estate",
  home: "real_estate",
  company: "foreign_companies",
  foreign_company: "foreign_companies",
  foreign_companies: "foreign_companies",
  brazilian_company: "brazilian_companies",
  brazilian_companies: "brazilian_companies",
  trust: "trust_interests",
  trust_interest: "trust_interests",
  trust_interests: "trust_interests",
  crypto: "crypto_assets",
  cryptocurrency: "crypto_assets",
  crypto_assets: "crypto_assets",
  loan: "loans_receivable",
  loans_receivable: "loans_receivable"
};

export type SessionIncomeFact = Pick<
  IncomeSource,
  | "incomeType"
  | "nature"
  | "originCountry"
  | "grossAmount"
  | "originalCurrency"
  | "periodicity"
  | "taxPaidOriginCountry"
  | "withholdingTax"
> & {
  paymentDate?: string;
  brazilianTaxTreatment?: string;
};

export type SessionAssetFact = {
  assetType: string;
  country?: string;
};

export type SessionTrustFact = {
  name?: string;
  jurisdiction?: string;
};

export type SessionFactsInput = {
  fiscal?: FiscalResidence | null;
  incomes?: SessionIncomeFact[];
  assets?: SessionAssetFact[];
  trusts?: SessionTrustFact[];
  /** Asset category tokens collected in copilot screening (interview ASSET_OPTIONS values). */
  assetTypeHints?: string[];
};

function isoToInterviewCountry(iso?: string): string {
  if (!iso) return "other";
  const upper = iso.toUpperCase().slice(0, 2);
  if (upper === "GB") return "uk";
  const lower = upper.toLowerCase();
  return INTERVIEW_COUNTRIES.has(lower) ? lower : "other";
}

function boolToYesNo(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? "yes" : "no";
}

function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function mapIncomeTypeToInterview(incomeType: string, nature?: string): string {
  const token = normalizeToken(incomeType);
  if (INCOME_TYPE_MAP[token]) return INCOME_TYPE_MAP[token];
  for (const [key, value] of Object.entries(INCOME_TYPE_MAP)) {
    if (token.includes(key)) return value;
  }
  if (nature && NATURE_FALLBACK[nature]) return NATURE_FALLBACK[nature];
  return "other_income";
}

export function mapAssetTypeToInterview(assetType: string): string {
  const token = normalizeToken(assetType);
  if (ASSET_TYPE_MAP[token]) return ASSET_TYPE_MAP[token];
  for (const [key, value] of Object.entries(ASSET_TYPE_MAP)) {
    if (token.includes(key)) return value;
  }
  return "other_assets";
}

function annualizeAmount(income: SessionIncomeFact): number {
  const amount = income.grossAmount;
  if (!Number.isFinite(amount) || amount < 0) return 0;
  switch (income.periodicity) {
    case "monthly":
      return amount * 12;
    case "annual":
      return amount;
    case "one_off":
    case "recurring":
    default:
      return amount;
  }
}

function mapFiscalToAnswers(fiscal: FiscalResidence): InterviewAnswers {
  const answers: InterviewAnswers = {};
  if (fiscal.fullName) answers.full_name = fiscal.fullName;
  if (fiscal.birthDate) answers.date_of_birth = fiscal.birthDate;
  answers.citizenship = isoToInterviewCountry(fiscal.nationalityCountry);
  answers.residence_country = isoToInterviewCountry(fiscal.currentResidenceCountry);

  const inBrazil = boolToYesNo(fiscal.physicallyLivesInBrazil);
  if (inBrazil) answers.currently_in_brazil = inBrazil;

  if (fiscal.brazilStays && fiscal.brazilStays.length > 0) {
    Object.assign(
      answers,
      syncBrazilStaysToInterviewAnswers(fiscal.brazilStays)
    );
  } else if (fiscal.firstEntryBrazilDate) {
    answers.brazil_trip_count = "1";
    answers.brazil_trip_1_entry = fiscal.firstEntryBrazilDate;
    if (fiscal.physicallyLivesInBrazil !== true && fiscal.fiscalResidenceBrazilEndDate) {
      answers.brazil_trip_1_exit = fiscal.fiscalResidenceBrazilEndDate;
    }
  }

  if (fiscal.immigrationStatus) answers.immigration_status = fiscal.immigrationStatus;
  if (fiscal.maritalStatus) answers.marital_status = fiscal.maritalStatus;

  const permit = boolToYesNo(fiscal.hasResidencePermit);
  if (permit) {
    answers.has_residence_permit = permit;
  } else if (fiscal.immigrationStatus) {
    if (IMMIGRATION_IMPLIES_PERMIT.has(fiscal.immigrationStatus)) {
      answers.has_residence_permit = "yes";
    } else if (fiscal.immigrationStatus === "tourist" || fiscal.immigrationStatus === "none") {
      answers.has_residence_permit = "no";
    }
  }

  if (fiscal.lastFilingCountry) {
    answers.last_filing_country =
      fiscal.lastFilingCountry === "none" ? "none" : isoToInterviewCountry(fiscal.lastFilingCountry);
  }

  const filedBr = boolToYesNo(fiscal.filedBrazilianReturn);
  if (filedBr) {
    answers.filed_brazilian_return = filedBr;
  } else if (answers.last_filing_country === "br") {
    answers.filed_brazilian_return = "yes";
  }

  const exit = boolToYesNo(fiscal.declaredPermanentExitBrazil);
  if (exit) answers.filed_departure_declaration = exit;

  const residencyClaims = [
    fiscal.isFiscalResidentBrazil === true,
    fiscal.isFiscalResidentUSA === true,
    fiscal.fiscalResidenceOtherCountry === true
  ].filter(Boolean).length;
  if (residencyClaims >= 2) {
    answers.dual_residency_risk = "yes";
  } else if (
    fiscal.isFiscalResidentBrazil !== undefined ||
    fiscal.isFiscalResidentUSA !== undefined ||
    fiscal.fiscalResidenceOtherCountry !== undefined
  ) {
    answers.dual_residency_risk = "no";
  }

  if (fiscal.hasCpf === true) {
    answers.has_cpf = "yes";
  } else if (fiscal.hasCpf === false) {
    answers.has_cpf = "no";
  } else if (fiscal.cpf && fiscal.cpf !== "none") {
    answers.has_cpf = "yes";
  } else if (fiscal.cpf === "none") {
    answers.has_cpf = "no";
  }

  if (typeof fiscal.dependentsCount === "number") {
    answers.dependents = String(fiscal.dependentsCount);
  } else if (fiscal.hasDependentsBrazilOrAbroad === true) {
    answers.dependents = "1";
  } else if (fiscal.hasDependentsBrazilOrAbroad === false) {
    answers.dependents = "0";
  }

  return answers;
}

function mapIncomesToAnswers(incomes: SessionIncomeFact[]): InterviewAnswers {
  if (incomes.length === 0) return {};
  const answers: InterviewAnswers = {};
  const byCategory = new Map<
    string,
    {
      amount: number;
      countries: Map<string, number>;
      currencies: Map<string, number>;
      withholding: number;
      paymentDate?: string;
      treatment?: string;
    }
  >();

  for (const income of incomes) {
    const category = mapIncomeTypeToInterview(income.incomeType, income.nature);
    const bucket = byCategory.get(category) ?? {
      amount: 0,
      countries: new Map<string, number>(),
      currencies: new Map<string, number>(),
      withholding: 0,
      paymentDate: undefined as string | undefined,
      treatment: undefined as string | undefined
    };
    const annual = annualizeAmount(income);
    bucket.amount += annual;
    const country = isoToInterviewCountry(income.originCountry);
    bucket.countries.set(country, (bucket.countries.get(country) ?? 0) + annual);
    bucket.currencies.set(
      income.originalCurrency,
      (bucket.currencies.get(income.originalCurrency) ?? 0) + annual
    );
    bucket.withholding += income.withholdingTax ?? income.taxPaidOriginCountry ?? 0;
    if (income.paymentDate && !bucket.paymentDate) bucket.paymentDate = income.paymentDate;
    if (income.brazilianTaxTreatment) bucket.treatment = income.brazilianTaxTreatment;
    byCategory.set(category, bucket);
  }

  const incomeTypes = Array.from(byCategory.keys());
  answers.income_types = incomeTypes;

  for (const [category, bucket] of byCategory) {
    answers[`income_${category}_amount`] = String(Math.round(bucket.amount));
    const topCountry = [...bucket.countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topCountry) answers[`income_${category}_country`] = topCountry;
    const topCurrency = [...bucket.currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topCurrency) answers[`income_${category}_currency`] = topCurrency;
    if (bucket.withholding > 0) {
      answers[`income_${category}_withholding`] = String(Math.round(bucket.withholding));
    }
    if (bucket.paymentDate) {
      answers[`income_${category}_payment_date`] = bucket.paymentDate;
    }
    if (bucket.treatment) {
      answers[`income_${category}_treatment`] = bucket.treatment;
    }
  }

  const paidForeign = incomes.some(
    (i) => (i.taxPaidOriginCountry ?? 0) > 0 || (i.withholdingTax ?? 0) > 0
  );
  answers.paid_foreign_tax = paidForeign ? "yes" : NOT_SURE;

  return answers;
}

function mapAssetsToAnswers(
  assets: SessionAssetFact[],
  trusts: SessionTrustFact[]
): InterviewAnswers {
  const answers: InterviewAnswers = {};
  const types = new Set<string>();
  for (const asset of assets) {
    types.add(mapAssetTypeToInterview(asset.assetType));
  }
  if (trusts.length > 0) types.add("trust_interests");
  if (types.size > 0) answers.asset_types = Array.from(types);
  return answers;
}

/** Project session/copilot facts into the interview record shape used by the 360° map. */
export function sessionFactsToInterviewRecord(input: SessionFactsInput): InterviewRecord {
  const answers: InterviewAnswers = {
    ...(input.fiscal ? mapFiscalToAnswers(input.fiscal) : {}),
    ...mapIncomesToAnswers(input.incomes ?? []),
    ...mapAssetsToAnswers(
      [
        ...(input.assets ?? []),
        ...(input.assetTypeHints ?? []).map((assetType) => ({ assetType }))
      ],
      input.trusts ?? []
    )
  };

  const hasCore =
    Boolean(answers.citizenship) &&
    Boolean(answers.residence_country) &&
    (Array.isArray(answers.income_types) ? answers.income_types.length > 0 : false);

  const hasAny = Object.keys(answers).length > 0;
  if (!hasAny) return emptyInterviewRecord();

  return {
    answers,
    documents: {},
    followUps: {},
    assessmentComplete: hasCore || Boolean(answers.citizenship && answers.residence_country),
    documentsComplete: false,
    reviewRequested: false,
    meta: {
      source: "copilot",
      projectedKeys: Object.keys(answers)
    }
  };
}
