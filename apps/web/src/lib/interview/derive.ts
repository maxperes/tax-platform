import { DOCUMENT_DEFS, labelFor, COUNTRY_OPTIONS, INCOME_OPTIONS, ASSET_OPTIONS } from "./options";
import { STEPS, stepsForInterview } from "./questions";
import { NOT_SURE } from "./types";
import type {
  AttentionLevel,
  InterviewRecord,
  DocumentStatus,
  FindingStatus,
  Option,
  StepStatus,
} from "./types";

type DemoRecord = InterviewRecord;

/* ---------------------------------------------------------------- helpers */

export function asString(record: DemoRecord, id: string): string | undefined {
  const value = record.answers[id];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asList(record: DemoRecord, id: string): string[] {
  const value = record.answers[id];
  return Array.isArray(value) ? value : [];
}

function isAnswered(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.length > 0;
}

function optionsFor(selected: string[], catalogue: Option[]): Option[] {
  return catalogue.filter((option) => selected.includes(option.value));
}

/* -------------------------------------------------------------- progress */

export function interviewSteps(record: DemoRecord) {
  const selected = asList(record, "income_types");
  return stepsForInterview(selected, {
    tripCount: asString(record, "brazil_trip_count"),
    currentlyInBrazil: asString(record, "currently_in_brazil"),
    assetTypes: asList(record, "asset_types")
  });
}

export function stepStatus(record: DemoRecord, stepIndex: number): StepStatus {
  const step = interviewSteps(record)[stepIndex] ?? STEPS[stepIndex];
  if (!step) return "not_started";
  const answered = step.questions.filter((q) => isAnswered(record.answers[q.id]));
  if (answered.length === 0) return "not_started";
  const required = step.questions.filter((q) => q.required);
  const requiredDone = required.every((q) => isAnswered(record.answers[q.id]));
  return requiredDone && answered.length === step.questions.length
    ? "complete"
    : "in_progress";
}

export function assessmentPercent(record: DemoRecord): number {
  const steps = interviewSteps(record);
  const total = steps.reduce((sum, step) => sum + step.questions.length, 0);
  const answered = steps.reduce(
    (sum, step) =>
      sum + step.questions.filter((q) => isAnswered(record.answers[q.id])).length,
    0,
  );
  return total === 0 ? 0 : Math.round((answered / total) * 100);
}

export function documentsPercent(record: DemoRecord): number {
  const reviewed = DOCUMENT_DEFS.filter((doc) => record.documents[doc.id]).length;
  return Math.round((reviewed / DOCUMENT_DEFS.length) * 100);
}

/** Weighted 70 % questionnaire, 30 % document checklist. */
export function overallPercent(record: DemoRecord): number {
  return Math.round(assessmentPercent(record) * 0.7 + documentsPercent(record) * 0.3);
}

/* ------------------------------------------------------------- inventory */

export function selectedIncome(record: DemoRecord): Option[] {
  return optionsFor(asList(record, "income_types"), INCOME_OPTIONS);
}

export function selectedAssets(record: DemoRecord): Option[] {
  return optionsFor(asList(record, "asset_types"), ASSET_OPTIONS);
}

export function documentsByStatus(
  record: DemoRecord,
  status: DocumentStatus,
): string[] {
  return DOCUMENT_DEFS.filter((doc) => record.documents[doc.id] === status).map(
    (doc) => doc.label,
  );
}

export function documentsNeedingAttention(record: DemoRecord): string[] {
  return DOCUMENT_DEFS.filter((doc) => {
    const status = record.documents[doc.id];
    return status === "missing" || status === "needs_review";
  }).map((doc) => doc.label);
}

/** Every country named anywhere in the answers, always including Brazil. */
export function countriesIdentified(record: DemoRecord): string[] {
  const codes = new Set<string>(["br"]);
  for (const id of ["citizenship", "residence_country", "last_filing_country"]) {
    const value = asString(record, id);
    if (value && value !== "none" && value !== NOT_SURE) codes.add(value);
  }
  for (const option of selectedIncome(record)) {
    const value = asString(record, `income_${option.value}_country`);
    if (value && value !== "none" && value !== NOT_SURE) codes.add(value);
  }
  for (const option of selectedAssets(record)) {
    const value = asString(record, `asset_${option.value}_country`);
    if (value && value !== "none" && value !== NOT_SURE) codes.add(value);
    if (option.value === "brazilian_companies") codes.add("br");
  }
  return Array.from(codes).map((code) => labelFor(COUNTRY_OPTIONS, code));
}

/* ------------------------------------------------------------- residency */

export interface ResidencySignal {
  label: string;
  value: string;
  note: string;
}

export function residencySignals(record: DemoRecord): ResidencySignal[] {
  const days = asString(record, "days_in_brazil");
  const daysLabel: Record<string, string> = {
    "0_30": "Fewer than 30 days",
    "31_90": "31 to 90 days",
    "91_182": "91 to 182 days",
    "183_plus": "183 days or more",
  };
  const permit = asString(record, "has_residence_permit");
  const intent = asString(record, "intends_to_remain");
  const dual = asString(record, "dual_residency_risk");

  return [
    {
      label: "Days of presence",
      value: days ? (daysLabel[days] ?? "Not answered") : "Not answered",
      note:
        days === "183_plus"
          ? "A long stay is one of the factors examined when residency is assessed."
          : "Days of presence are one factor among several.",
    },
    {
      label: "Residence permit",
      value:
        permit === "yes" ? "Held" : permit === "no" ? "Not held" : "Not confirmed",
      note: "Immigration status and tax residency are assessed separately.",
    },
    {
      label: "Intention to remain",
      value:
        intent === "yes"
          ? "Indefinite"
          : intent === "temporarily"
            ? "Defined period"
            : intent === "no"
              ? "No"
              : "Not confirmed",
      note: "Stated intention is context, not a conclusion.",
    },
    {
      label: "Possible dual residency",
      value: dual === "yes" ? "Flagged" : dual === "no" ? "Not flagged" : "Unclear",
      note: "Two countries can apply their own rules to the same period.",
    },
  ];
}

export interface TimelineEvent {
  date: string;
  title: string;
  detail: string;
}

export function residencyTimeline(record: DemoRecord): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const entry = asString(record, "first_entry_date");
  const filingCountry = asString(record, "last_filing_country");
  const tripCount = Number(asString(record, "brazil_trip_count"));
  const hasTrips = Number.isInteger(tripCount) && tripCount >= 1;

  if (filingCountry && filingCountry !== "none" && filingCountry !== NOT_SURE) {
    events.push({
      date: "Previous year",
      title: `Tax return filed in ${labelFor(COUNTRY_OPTIONS, filingCountry)}`,
      detail: "Reported by you in the questionnaire.",
    });
  }
  if (hasTrips) {
    for (let index = 1; index <= tripCount; index += 1) {
      const tripEntry = asString(record, `brazil_trip_${index}_entry`);
      const tripExit = asString(record, `brazil_trip_${index}_exit`);
      if (tripEntry && tripEntry !== NOT_SURE) {
        events.push({
          date: tripEntry,
          title: `Entry into Brazil (stay ${index})`,
          detail: "Used for the rolling 183-day presence test.",
        });
      }
      if (tripExit && tripExit !== NOT_SURE) {
        events.push({
          date: tripExit,
          title: `Exit from Brazil (stay ${index})`,
          detail: "Closes this stay for the presence calendar.",
        });
      }
    }
  } else if (entry && entry !== NOT_SURE) {
    events.push({
      date: entry,
      title: "First entry into Brazil in the relevant year",
      detail: "Start of the presence period considered in the analysis.",
    });
  }
  const days = asString(record, "days_in_brazil");
  if (days) {
    events.push({
      date: "Rolling twelve months",
      title: "Presence in Brazil recorded",
      detail: hasTrips
        ? "Stay dates are the primary input; this band is a fallback estimate."
        : "Counted from the estimate you provided.",
    });
  }
  if (asString(record, "currently_in_brazil") === "yes") {
    events.push({
      date: "Today",
      title: "Currently present in Brazil",
      detail: "Ongoing presence, still to be confirmed with entry records.",
    });
  }
  events.push({
    date: "Next step",
    title: "Residency position reviewed by a professional",
    detail: "Entry and exit records are needed before any conclusion.",
  });
  return events;
}

/* --------------------------------------------------------- country cards */

export interface CountryBlock {
  key: string;
  name: string;
  active: boolean;
  incomeCount: number;
  assetCount: number;
  taxesPaid: string;
  documentsAvailable: number;
  note: string;
}

const BRAZIL_DOCS = ["prior_brazilian_return", "property_documents"];
const FOREIGN_DOCS = [
  "foreign_tax_return",
  "foreign_tax_evidence",
  "retirement_statement",
  "brokerage_statement",
  "bank_statement",
  "salary_statement",
];

function countAvailable(record: DemoRecord, ids: string[]): number {
  return ids.filter((id) => record.documents[id] === "available").length;
}

export function countryBlocks(record: DemoRecord): CountryBlock[] {
  const income = selectedIncome(record);
  const assets = selectedAssets(record);
  const incomeCountry = (optionValue: string) => asString(record, `income_${optionValue}_country`);
  const assetCountry = (optionValue: string) => {
    const answered = asString(record, `asset_${optionValue}_country`);
    if (answered && answered !== NOT_SURE) return answered;
    if (optionValue === "brazilian_companies") return "br";
    return undefined;
  };

  const codes = new Set<string>();
  for (const id of ["citizenship", "residence_country", "last_filing_country"]) {
    const value = asString(record, id);
    if (value && value !== "none" && value !== NOT_SURE) codes.add(value);
  }
  const hasUs = codes.has("us") || income.some((item) => incomeCountry(item.value) === "us") ||
    assets.some((item) => assetCountry(item.value) === "us");
  const hasOther = Array.from(codes).some((code) => code !== "us" && code !== "br") ||
    income.some((item) => {
      const country = incomeCountry(item.value);
      return Boolean(country && country !== "us" && country !== "br" && country !== NOT_SURE);
    }) ||
    assets.some((item) => {
      const country = assetCountry(item.value);
      return Boolean(country && country !== "us" && country !== "br" && country !== NOT_SURE);
    });
  const paidForeignTax = asString(record, "paid_foreign_tax");
  const taxesPaidLabel =
    paidForeignTax === "yes"
      ? "Reported"
      : paidForeignTax === "no"
        ? "None reported"
        : "Not confirmed";

  const incomeIn = (country: string) =>
    income.filter((item) => incomeCountry(item.value) === country).length;
  const assetsIn = (country: string) =>
    assets.filter((item) => assetCountry(item.value) === country).length;
  const incomeOther = income.filter((item) => {
    const country = incomeCountry(item.value);
    return Boolean(country && country !== "us" && country !== "br" && country !== NOT_SURE);
  }).length;
  const assetsOther = assets.filter((item) => {
    const country = assetCountry(item.value);
    return Boolean(country && country !== "us" && country !== "br" && country !== NOT_SURE);
  }).length;

  return [
    {
      key: "us",
      name: "United States",
      active: hasUs,
      incomeCount: incomeIn("us"),
      assetCount: assetsIn("us"),
      taxesPaid: hasUs ? taxesPaidLabel : "Not applicable",
      documentsAvailable: hasUs ? countAvailable(record, FOREIGN_DOCS) : 0,
      note: hasUs
        ? "Income and assets you placed in the United States."
        : "No United States connection reported.",
    },
    {
      key: "br",
      name: "Brazil",
      active: true,
      incomeCount: incomeIn("br"),
      assetCount: assetsIn("br"),
      taxesPaid:
        asString(record, "filed_brazilian_return") === "yes"
          ? "Return filed previously"
          : "No Brazilian filing reported",
      documentsAvailable: countAvailable(record, BRAZIL_DOCS),
      note: "Brazil is the reference country for this assessment.",
    },
    {
      key: "other",
      name: "Other countries",
      active: hasOther,
      incomeCount: incomeOther,
      assetCount: assetsOther,
      taxesPaid: hasOther ? taxesPaidLabel : "Not applicable",
      documentsAvailable: hasOther ? countAvailable(record, FOREIGN_DOCS) : 0,
      note: hasOther
        ? "Income and assets you placed in countries other than the United States or Brazil."
        : "No other country reported.",
    },
  ];
}

/* --------------------------------------------------------------- findings */

export interface Finding {
  label: string;
  status: FindingStatus;
  note: string;
}

export function preliminaryFindings(record: DemoRecord): Finding[] {
  const findings: Finding[] = [];
  const income = selectedIncome(record);
  const assets = selectedAssets(record);
  const attention = documentsNeedingAttention(record);

  findings.push({
    label: "Personal and immigration profile",
    status:
      stepStatus(record, 0) === "complete" && stepStatus(record, 1) === "complete"
        ? "information_complete"
        : "not_yet_analyzed",
    note: "Used as the starting point for every other section.",
  });

  findings.push({
    label: "Tax residency position",
    status: "professional_review_recommended",
    note: "Residency is never settled from a questionnaire alone.",
  });

  findings.push({
    label: "Income classification",
    status:
      income.length === 0
        ? "not_yet_analyzed"
        : "professional_review_recommended",
    note:
      income.length === 0
        ? "No income categories selected yet."
        : `${income.length} categor${income.length === 1 ? "y" : "ies"} may be classified differently under Brazilian rules.`,
  });

  findings.push({
    label: "Asset reporting",
    status: assets.length === 0 ? "not_yet_analyzed" : "additional_document_needed",
    note:
      assets.length === 0
        ? "No asset categories selected yet."
        : "Asset reporting usually needs year-end balances and acquisition history.",
  });

  if (asString(record, "paid_foreign_tax") === "yes") {
    findings.push({
      label: "Foreign tax already paid",
      status:
        record.documents["foreign_tax_evidence"] === "available"
          ? "professional_review_recommended"
          : "additional_document_needed",
      note: "Credit eligibility depends on the treaty position and on documentary evidence.",
    });
  }

  if (asString(record, "owns_entities") === "yes") {
    findings.push({
      label: "Foreign companies or trusts",
      status: "potential_tax_issue",
      note: "Ownership abroad can create separate reporting obligations.",
    });
  }

  if (asString(record, "dual_residency_risk") === "yes") {
    findings.push({
      label: "Overlapping residency claims",
      status: "potential_tax_issue",
      note: "Two countries may treat the same period as resident time.",
    });
  }

  findings.push({
    label: "Documentation",
    status:
      attention.length === 0
        ? "information_complete"
        : "additional_document_needed",
    note:
      attention.length === 0
        ? "Nothing flagged as missing in the checklist."
        : `${attention.length} item${attention.length === 1 ? "" : "s"} marked missing or in need of review.`,
  });

  return findings;
}

/* --------------------------------------------------------- analysis areas */

export interface AnalysisArea {
  label: string;
  relevant: boolean;
  note: string;
}

export function analysisAreas(record: DemoRecord): AnalysisArea[] {
  const income = asList(record, "income_types");
  const assets = asList(record, "asset_types");
  const has = (list: string[], ...keys: string[]) =>
    keys.some((key) => list.includes(key));

  return [
    {
      label: "Foreign tax credit",
      relevant: asString(record, "paid_foreign_tax") === "yes",
      note: "Potential relief for tax already paid abroad, subject to treaty and evidence.",
    },
    {
      label: "Retirement income",
      relevant: has(income, "social_security", "government_pension", "private_pension"),
      note: "Treatment can differ depending on the legal nature of each benefit.",
    },
    {
      label: "Foreign investments",
      relevant: has(assets, "brokerage", "crypto_assets", "retirement_accounts"),
      note: "Classification and valuation rules may apply differently to each account type.",
    },
    {
      label: "Tax residency",
      relevant: true,
      note: "The starting question for every other area.",
    },
    {
      label: "Corporate interests",
      relevant:
        has(assets, "foreign_companies", "brazilian_companies") ||
        asString(record, "owns_entities") === "yes",
      note: "Ownership structures may carry additional reporting duties.",
    },
    {
      label: "Capital gains",
      relevant: has(income, "capital_gains") || has(assets, "real_estate", "brokerage"),
      note: "Timing of a disposal can change the outcome considerably.",
    },
    {
      label: "Real estate income",
      relevant: has(income, "rental") || has(assets, "real_estate"),
      note: "Property held or rented in either country needs separate treatment.",
    },
  ];
}

/* ------------------------------------------------------------ observations */

export function preliminaryObservations(record: DemoRecord): string[] {
  const observations: string[] = [
    "Brazilian tax residency may require further review before any filing decision.",
  ];
  const income = asList(record, "income_types");
  const assets = asList(record, "asset_types");

  if (income.length > 0) {
    observations.push(
      "Foreign income may need classification under Brazilian rules, category by category.",
    );
  }
  if (asString(record, "paid_foreign_tax") === "yes") {
    observations.push(
      "Foreign taxes paid may require a credit eligibility analysis under the applicable treaty or domestic rules.",
    );
  }
  if (
    income.includes("social_security") ||
    income.includes("private_pension") ||
    income.includes("government_pension")
  ) {
    observations.push(
      "Retirement income may receive different treatment depending on its legal nature and source.",
    );
  }
  if (
    assets.includes("foreign_companies") ||
    assets.includes("trust_interests") ||
    asString(record, "owns_entities") === "yes"
  ) {
    observations.push(
      "Foreign company or trust interests may create additional reporting obligations.",
    );
  }
  if (assets.includes("real_estate") || income.includes("rental")) {
    observations.push(
      "Property held abroad may need to be reported even in years with no rental income.",
    );
  }
  if (asString(record, "dual_residency_risk") === "yes") {
    observations.push(
      "More than one country may claim residency for the same period, which typically calls for a treaty analysis.",
    );
  }
  return observations;
}

export function missingInformation(record: DemoRecord): string[] {
  const missing: string[] = [];
  for (const step of interviewSteps(record)) {
    for (const question of step.questions) {
      const value = record.answers[question.id];
      if (!isAnswered(value)) {
        missing.push(`${question.label} — not answered`);
      } else if (value === NOT_SURE) {
        missing.push(`${question.label} — answered "I'm not sure"`);
      }
    }
  }
  for (const doc of DOCUMENT_DEFS) {
    const status = record.documents[doc.id];
    if (!status) missing.push(`${doc.label} — not reviewed`);
    if (status === "missing") missing.push(`${doc.label} — marked as missing`);
  }
  return missing;
}

/* ------------------------------------------------------------- attention */

export interface AttentionIndicator {
  label: string;
  level: AttentionLevel;
  note: string;
}

export function attentionIndicators(record: DemoRecord): AttentionIndicator[] {
  const attention = documentsNeedingAttention(record);
  const indicators: AttentionIndicator[] = [
    {
      label: "Residency determination",
      level: "professional_analysis_required",
      note: "Requires entry and exit records and a look at the other country's rules.",
    },
    {
      label: "Documentation completeness",
      level:
        attention.length === 0
          ? "low_attention"
          : attention.length > 3
            ? "professional_analysis_required"
            : "review_recommended",
      note:
        attention.length === 0
          ? "Nothing flagged in the checklist."
          : `${attention.length} item${attention.length === 1 ? "" : "s"} still to resolve.`,
    },
    {
      label: "Income classification",
      level:
        selectedIncome(record).length > 4
          ? "professional_analysis_required"
          : "review_recommended",
      note: "The more categories involved, the more classification questions arise.",
    },
  ];

  if (asString(record, "owns_entities") === "yes") {
    indicators.push({
      label: "Entity ownership",
      level: "professional_analysis_required",
      note: "Companies and trusts abroad carry their own reporting rules.",
    });
  }
  return indicators;
}

/* ---------------------------------------------------------------- labels */

export const FINDING_LABELS: Record<FindingStatus, string> = {
  information_complete: "Information complete",
  additional_document_needed: "Additional document needed",
  professional_review_recommended: "Professional review recommended",
  potential_tax_issue: "Potential tax issue",
  not_yet_analyzed: "Not yet analysed",
};

export const ATTENTION_LABELS: Record<AttentionLevel, string> = {
  low_attention: "Low attention",
  review_recommended: "Review recommended",
  professional_analysis_required: "Professional analysis required",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  available: "Available",
  missing: "Missing",
  not_applicable: "Not applicable",
  needs_review: "Needs professional review",
};

export function interviewNavStatus(record: DemoRecord): {
  assessment: StepStatus;
  documents: StepStatus;
  map: StepStatus;
  report: StepStatus;
} {
  const assessmentPct = assessmentPercent(record);
  const docsPct = documentsPercent(record);
  const assessment: StepStatus = record.assessmentComplete || assessmentPct === 100
    ? "complete"
    : assessmentPct > 0
      ? "in_progress"
      : "not_started";
  const documents: StepStatus = record.documentsComplete || docsPct === 100
    ? "complete"
    : docsPct > 0
      ? "in_progress"
      : "not_started";
  const map: StepStatus = record.assessmentComplete ? "complete" : "not_started";
  const report: StepStatus = record.reviewRequested
    ? "complete"
    : record.assessmentComplete
      ? "in_progress"
      : "not_started";
  return { assessment, documents, map, report };
}
