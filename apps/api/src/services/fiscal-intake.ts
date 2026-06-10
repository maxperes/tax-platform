import { fiscalResidenceSchema } from "@tax-platform/shared";

export type FiscalFieldDef = { key: string; prompt: string };

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  brazil: "BR",
  brasil: "BR",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  america: "US",
  portugal: "PT",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  canada: "CA",
  mexico: "MX",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  uruguay: "UY",
  paraguay: "PY",
  switzerland: "CH",
  netherlands: "NL",
  belgium: "BE",
  ireland: "IE",
  australia: "AU",
  "new zealand": "NZ",
  japan: "JP",
  china: "CN",
  india: "IN",
  singapore: "SG",
  "south korea": "KR",
  korea: "KR"
};

export function normalizeCountryCode(raw: string): string {
  const t = raw.trim();
  if (/^[A-Za-z]{2,3}$/.test(t)) return t.toUpperCase();
  const mapped = COUNTRY_NAME_TO_ISO[t.toLowerCase()];
  return mapped ?? t;
}

const FISCAL_CORE_FIELDS: FiscalFieldDef[] = [
  {
    key: "currentResidenceCountry",
    prompt: "Which country do you currently live in? (e.g. Brazil or BR)"
  },
  {
    key: "nationalityCountry",
    prompt: "What is your country of nationality? (e.g. Brazil or BR, United States or US)"
  },
  {
    key: "isFiscalResidentBrazil",
    prompt: "Are you a fiscal resident of Brazil for tax purposes? (yes/no)"
  },
  { key: "isFiscalResidentUSA", prompt: "Are you a fiscal resident of the United States? (yes/no)" },
  {
    key: "fiscalResidenceOtherCountry",
    prompt: "Do you have fiscal residence in any other country besides Brazil and the USA? (yes/no)"
  }
];

const FISCAL_CONDITIONAL_FIELDS: { key: string; prompt: string; when: (m: Record<string, unknown>) => boolean }[] =
  [
    {
      key: "daysInBrazilCalendarYear",
      prompt: "How many days did you spend in Brazil in the tax year? (0–366)",
      when: needsComplexFiscalFollowUp
    },
    {
      key: "daysInUSACalendarYear",
      prompt: "How many days did you spend in the United States in the tax year? (0–366)",
      when: needsComplexFiscalFollowUp
    },
    {
      key: "hasUSCitizenship",
      prompt: "Do you have US citizenship? (yes/no)",
      when: needsComplexFiscalFollowUp
    },
    {
      key: "hasGreenCard",
      prompt: "Do you have a US green card? (yes/no)",
      when: needsComplexFiscalFollowUp
    },
    {
      key: "declaredPermanentExitBrazil",
      prompt: "Did you file a definitive exit declaration from Brazil? (yes/no)",
      when: needsBrazilExitFollowUp
    }
  ];

const FISCAL_TAIL_FIELDS: FiscalFieldDef[] = [
  { key: "cpf", prompt: "What is your CPF (if applicable)? Reply **none** to skip." },
  { key: "foreignTaxId", prompt: "What is your foreign tax ID (e.g. US SSN/ITIN)? Reply **none** to skip." },
  { key: "physicallyLivesInBrazil", prompt: "Do you physically live in Brazil? (yes/no)" },
  { key: "hasPermanentAddressBrazil", prompt: "Do you have a permanent address in Brazil? (yes/no)" },
  { key: "hasPermanentAddressUSA", prompt: "Do you have a permanent address in the United States? (yes/no)" },
  { key: "hasUSWorkVisa", prompt: "Do you have a US work visa? (yes/no)" },
  { key: "hasDependentsBrazilOrAbroad", prompt: "Do you have fiscal dependents in Brazil or abroad? (yes/no)" },
  { key: "birthDate", prompt: "What is your date of birth (YYYY-MM-DD)?" },
  { key: "fullName", prompt: "Great, now what is your full legal name?" },
  { key: "email", prompt: "And what email should we use for your account notifications?" }
];

export function parseBool(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "sim"].includes(t)) return true;
  if (["no", "n", "false", "0", "nao", "não"].includes(t)) return false;
  return undefined;
}

export function coerceBoolLike(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return parseBool(raw);
  return undefined;
}

export function needsComplexFiscalFollowUp(merged: Record<string, unknown>): boolean {
  const br = coerceBoolLike(merged.isFiscalResidentBrazil);
  const us = coerceBoolLike(merged.isFiscalResidentUSA);
  const other = coerceBoolLike(merged.fiscalResidenceOtherCountry);
  if (br === undefined || us === undefined || other === undefined) return false;
  if (br && us) return true;
  if ((br || us) && other) return true;
  if (!br && !us && !other) return true;
  const res = String(merged.currentResidenceCountry ?? "")
    .trim()
    .toUpperCase();
  if (res === "US" && us === false) return true;
  if (res === "BR" && br === false) return true;
  return false;
}

export function needsBrazilExitFollowUp(merged: Record<string, unknown>): boolean {
  const br = coerceBoolLike(merged.isFiscalResidentBrazil);
  const nat = String(merged.nationalityCountry ?? "")
    .trim()
    .toUpperCase();
  return br === false && nat === "BR";
}

export function getActiveFiscalFieldOrder(merged: Record<string, unknown>): FiscalFieldDef[] {
  const conditional = FISCAL_CONDITIONAL_FIELDS.filter((f) => f.when(merged)).map(({ key, prompt }) => ({
    key,
    prompt
  }));
  return [...FISCAL_CORE_FIELDS, ...conditional, ...FISCAL_TAIL_FIELDS];
}

export function firstFiscalFieldPrompt(): string {
  return FISCAL_CORE_FIELDS[0]!.prompt;
}

export function applyDefaultPrimaryCurrency(merged: Record<string, unknown>): void {
  const existing = merged.primaryCurrency;
  if (typeof existing === "string" && /^[A-Za-z]{3}$/.test(existing.trim())) return;
  const res = String(merged.currentResidenceCountry ?? "")
    .trim()
    .toUpperCase();
  if (res === "BR") merged.primaryCurrency = "BRL";
  else if (res === "US") merged.primaryCurrency = "USD";
  else merged.primaryCurrency = "EUR";
}

export function coerceFiscalFieldValue(key: string, raw: string): unknown {
  if (
    key === "fiscalResidenceOtherCountry" ||
    key === "isFiscalResidentBrazil" ||
    key === "isFiscalResidentUSA" ||
    key === "hasUSCitizenship" ||
    key === "hasGreenCard" ||
    key === "declaredPermanentExitBrazil" ||
    key === "physicallyLivesInBrazil" ||
    key === "hasPermanentAddressBrazil" ||
    key === "hasPermanentAddressUSA" ||
    key === "hasUSWorkVisa" ||
    key === "hasDependentsBrazilOrAbroad"
  ) {
    const b = parseBool(raw);
    if (b !== undefined) return b;
  }
  if (key === "daysInBrazilCalendarYear" || key === "daysInUSACalendarYear") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 366) return n;
  }
  if (key === "birthDate") {
    const t = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (mmddyyyy) {
      const month = Number(mmddyyyy[1]);
      const day = Number(mmddyyyy[2]);
      const year = Number(mmddyyyy[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    return t;
  }
  const t = raw.trim();
  if (key === "cpf" || key === "foreignTaxId") {
    if (/^(none|n\/a|skip)$/i.test(t)) return undefined;
    return t;
  }
  if (key === "nationalityCountry" || key === "currentResidenceCountry") {
    return normalizeCountryCode(t);
  }
  return t;
}

export function coerceFiscalBooleansInPlace(ctx: Record<string, unknown>): void {
  for (const k of [
    "isFiscalResidentBrazil",
    "isFiscalResidentUSA",
    "fiscalResidenceOtherCountry",
    "hasUSCitizenship",
    "hasGreenCard",
    "declaredPermanentExitBrazil",
    "physicallyLivesInBrazil",
    "hasPermanentAddressBrazil",
    "hasPermanentAddressUSA",
    "hasUSWorkVisa",
    "hasDependentsBrazilOrAbroad"
  ] as const) {
    const v = ctx[k];
    if (typeof v === "string") {
      const b = parseBool(v);
      if (b !== undefined) ctx[k] = b;
    }
  }
}

export function isValidFiscalFieldValue(key: string, raw: unknown): boolean {
  if (
    key === "isFiscalResidentBrazil" ||
    key === "isFiscalResidentUSA" ||
    key === "fiscalResidenceOtherCountry" ||
    key === "hasUSCitizenship" ||
    key === "hasGreenCard" ||
    key === "declaredPermanentExitBrazil" ||
    key === "physicallyLivesInBrazil" ||
    key === "hasPermanentAddressBrazil" ||
    key === "hasPermanentAddressUSA" ||
    key === "hasUSWorkVisa" ||
    key === "hasDependentsBrazilOrAbroad"
  ) {
    return coerceBoolLike(raw) !== undefined;
  }
  if (key === "cpf" || key === "foreignTaxId") {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === "string" && /^(none|n\/a|skip)$/i.test(raw.trim())) return true;
    return typeof raw === "string" && raw.trim().length >= 1;
  }
  if (key === "daysInBrazilCalendarYear" || key === "daysInUSACalendarYear") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 366;
  }
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (key === "nationalityCountry" || key === "currentResidenceCountry") {
    const normalized = normalizeCountryCode(String(raw));
    return /^[A-Za-z]{2,3}$/.test(normalized);
  }
  if (key === "birthDate") return /^\d{4}-\d{2}-\d{2}$/.test(t);
  if (key === "fullName") return t.length >= 1;
  if (key === "email") return fiscalResidenceSchema.shape.email.safeParse(t).success;
  return false;
}

export function looksLikeFiscalFieldAnswer(key: string, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    key === "isFiscalResidentBrazil" ||
    key === "isFiscalResidentUSA" ||
    key === "fiscalResidenceOtherCountry" ||
    key === "hasUSCitizenship" ||
    key === "hasGreenCard" ||
    key === "declaredPermanentExitBrazil" ||
    key === "physicallyLivesInBrazil" ||
    key === "hasPermanentAddressBrazil" ||
    key === "hasPermanentAddressUSA" ||
    key === "hasUSWorkVisa" ||
    key === "hasDependentsBrazilOrAbroad"
  ) {
    return parseBool(t) !== undefined;
  }
  if (key === "cpf" || key === "foreignTaxId") {
    return t.length >= 1;
  }
  if (key === "daysInBrazilCalendarYear" || key === "daysInUSACalendarYear") {
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 && n <= 366;
  }
  if (key === "email") return t.includes("@") && t.includes(".");
  if (key === "birthDate") return /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t);
  if (key === "nationalityCountry" || key === "currentResidenceCountry") {
    const normalized = normalizeCountryCode(t);
    return /^[A-Za-z]{2,3}$/.test(normalized);
  }
  if (key === "fullName") return /[A-Za-zÀ-ÿ]/.test(t) && t.length >= 2;
  return true;
}

export function getFiscalQuestionForContext(context: Record<string, unknown>): string {
  const merged = context;
  for (const { key, prompt } of getActiveFiscalFieldOrder(merged)) {
    if (!isValidFiscalFieldValue(key, merged[key])) return prompt;
  }
  return "Say **next step** when you are ready to continue.";
}

export function formatFiscalValidationError(): string {
  return "Some answers did not look right. Let's go through your fiscal profile again from the start.";
}

export function prepareFiscalPayloadForValidation(merged: Record<string, unknown>): Record<string, unknown> {
  const out = { ...merged };
  applyDefaultPrimaryCurrency(out);
  coerceFiscalBooleansInPlace(out);
  return out;
}
