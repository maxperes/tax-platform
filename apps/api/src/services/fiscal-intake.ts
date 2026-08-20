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

const IMMIGRATION_STATUS_OPTIONS: { id: string; label: string }[] = [
  { id: "tourist", label: "Tourist or visitor" },
  { id: "temporary_visa", label: "Temporary visa" },
  { id: "digital_nomad", label: "Digital nomad visa" },
  { id: "work_visa", label: "Work visa" },
  { id: "retirement_visa", label: "Retirement visa" },
  { id: "family_reunion", label: "Family reunion" },
  { id: "permanent", label: "Permanent residence" },
  { id: "citizen", label: "Brazilian citizen" },
  { id: "none", label: "No Brazilian status" }
];

function formatNumberedChoices(question: string, options: { label: string }[], footer: string): string {
  return (
    `${question}\n\n` +
    options.map((o, i) => `${i + 1}. ${o.label}`).join("\n") +
    `\n\n${footer}`
  );
}

function parseNumberedChoice(text: string, options: { id: string }[]): string | undefined {
  const numbered = text.trim().match(/^(?:option\s+)?(\d{1,2})(?:[.)]\s*)?$/i);
  if (!numbered) return undefined;
  const n = Number(numbered[1]);
  if (!Number.isInteger(n) || n < 1 || n > options.length) return undefined;
  return options[n - 1]!.id;
}

const FISCAL_CORE_FIELDS: FiscalFieldDef[] = [
  {
    key: "physicallyLivesInBrazil",
    prompt: "Are you currently in Brazil? (yes/no)"
  },
  {
    key: "brazilStaysText",
    prompt:
      "Record your Brazil entry and exit dates. List every stay in the last couple of years — one stay per line: **ENTRY YYYY-MM-DD, EXIT YYYY-MM-DD** (write **ongoing** if still in Brazil). Example:\n2024-03-01, 2024-06-15\n2024-09-01, ongoing"
  },
  {
    key: "currentResidenceCountry",
    prompt: "Where do you actually live today? Reply with a country name or ISO code (e.g. Brazil or BR)."
  },
  {
    key: "nationalityCountry",
    prompt: "What is your country of citizenship / nationality? (e.g. United States or US)"
  },
  {
    key: "isFiscalResidentBrazil",
    prompt: "Do you consider yourself a tax resident of Brazil? (yes/no)"
  },
  {
    key: "isFiscalResidentUSA",
    prompt: "Do you consider yourself a tax resident of the United States? (yes/no)"
  },
  {
    key: "fiscalResidenceOtherCountry",
    prompt: "Could another country besides Brazil and the US treat you as a tax resident? (yes/no)"
  }
];

const FISCAL_MAP_FIELDS: FiscalFieldDef[] = [
  {
    key: "immigrationStatus",
    prompt: formatNumberedChoices(
      "What is your Brazilian immigration status?",
      IMMIGRATION_STATUS_OPTIONS,
      "Reply with **1–9**, or **not sure**."
    )
  },
  {
    key: "hasCpf",
    prompt:
      "Do you have a Brazilian tax ID (CPF)? Reply **yes** or **no** — do not send the number."
  },
  {
    key: "lastFilingCountry",
    prompt:
      "Where did you file a tax return last year? Country name or ISO, or **none** / **not sure**."
  },
  {
    key: "declaredPermanentExitBrazil",
    prompt:
      "Have you filed a Brazilian permanent exit declaration (saída definitiva)? Reply **yes**, **no**, or **not applicable**."
  },
  {
    key: "maritalStatus",
    prompt:
      "What is your marital status?\n\n" +
      "1. Single\n" +
      "2. Married\n" +
      "3. Stable union / civil partnership (união estável)\n" +
      "4. Divorced\n" +
      "5. Widowed\n\n" +
      "Reply with **1–5**, or **not sure**."
  },
  {
    key: "dependentsCount",
    prompt:
      "How many people do you claim as dependents for tax purposes? Reply with a number, or **0**."
  }
];

const FISCAL_CONDITIONAL_FIELDS: { key: string; prompt: string; when: (m: Record<string, unknown>) => boolean }[] =
  [
    {
      key: "hasResidencePermit",
      prompt: "Do you have a Brazilian residence permit? (yes/no / not sure)",
      when: needsResidencePermitQuestion
    },
    {
      key: "filedBrazilianReturn",
      prompt: "Have you ever filed a Brazilian tax return? (yes/no / not sure)",
      when: needsFiledBrazilianReturnQuestion
    },
    {
      key: "daysInUSACalendarYear",
      prompt: "How many days did you spend in the United States in the tax year? (0–366, or **not sure**)",
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
    }
  ];

const FISCAL_TAIL_FIELDS: FiscalFieldDef[] = [
  { key: "birthDate", prompt: "What is your date of birth? Reply **YYYY-MM-DD** (e.g. 1988-01-01). Slash dates like **01/01/1988** also work." },
  { key: "fullName", prompt: "What name should we use on this file? A first and last name is enough." }
];

function parseSlashDate(raw: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const year = Number(m[3]);
  let month = a;
  let day = b;
  if (a > 12 && b >= 1 && b <= 12) {
    day = a;
    month = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function looksLikeDateAnswer(text: string): boolean {
  const t = text.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t);
}

const NOT_SURE_TOKENS = /^(not[_\s-]?sure|unsure|unknown|idk|n\/a)$/i;
const SKIP_TOKENS = /^(none|n\/a|skip|not[_\s-]?applicable|na)$/i;

const IMMIGRATION_VALUES = new Set(IMMIGRATION_STATUS_OPTIONS.map((o) => o.id));

const MARITAL_STATUS_OPTIONS: { id: "single" | "married" | "stable_union" | "divorced" | "widowed"; label: string }[] =
  [
    { id: "single", label: "Single" },
    { id: "married", label: "Married" },
    { id: "stable_union", label: "Stable union / civil partnership (união estável)" },
    { id: "divorced", label: "Divorced" },
    { id: "widowed", label: "Widowed" }
  ];

const MARITAL_VALUES = new Set<string>(MARITAL_STATUS_OPTIONS.map((o) => o.id));

function isNotSureToken(raw: string): boolean {
  return NOT_SURE_TOKENS.test(raw.trim());
}

function parseDaysInBrazil(raw: string): number | "not_sure" | undefined {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (isNotSureToken(t)) return "not_sure";
  if (/^(0[_\s-]?30|under 30|fewer than 30|less than 30)$/.test(t)) return 15;
  if (/^(31[_\s-]?90)$/.test(t)) return 60;
  if (/^(91[_\s-]?182)$/.test(t)) return 136;
  if (/^(183\+|183[_\s-]?plus|183 or more|more than 182)$/.test(t)) return 200;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 0 && n <= 366) return n;
  return undefined;
}

function parseImmigrationStatus(raw: string): string | "not_sure" | undefined {
  const trimmed = raw.trim();
  if (isNotSureToken(trimmed)) return "not_sure";
  const lower = trimmed.toLowerCase();
  if (/\bdigital\s+nomad\b/.test(lower)) return "digital_nomad";
  if (/\bfamily\s+reunion\b/.test(lower)) return "family_reunion";
  if (/\bretirement\s+visa\b/.test(lower)) return "retirement_visa";
  if (/\bwork\s+visa\b/.test(lower)) return "work_visa";
  if (/\btemporary\s+visa\b/.test(lower)) return "temporary_visa";
  if (/\bpermanent\s+(residence|resident)\b/.test(lower)) return "permanent";
  if (/\b(brazilian\s+citizen|citizenship|citizen)\b/.test(lower)) return "citizen";
  if (/\b(tourist|visitor)\b/.test(lower)) return "tourist";
  if (/^(none|no brazilian status|no status)$/i.test(trimmed)) return "none";
  const numbered = parseNumberedChoice(trimmed, IMMIGRATION_STATUS_OPTIONS);
  if (numbered) return numbered;
  const t = lower.replace(/[\s-]+/g, "_");
  if (t === "visitor") return "tourist";
  if (t === "permanent_residence" || t === "resident") return "permanent";
  if (t === "brazilian_citizen" || t === "brazilian") return "citizen";
  if (IMMIGRATION_VALUES.has(t)) return t;
  return undefined;
}

function parseMaritalStatus(raw: string): string | "not_sure" | undefined {
  const trimmed = raw.trim();
  if (isNotSureToken(trimmed)) return "not_sure";
  const lower = trimmed.toLowerCase();
  if (/\bstable\s+union\b/.test(lower) || /\bcivil\s+union\b/.test(lower)) return "stable_union";
  if (/\bmarried\b/.test(lower)) return "married";
  if (/\bdivorced\b/.test(lower)) return "divorced";
  if (/\bwidowed\b/.test(lower)) return "widowed";
  if (/\bsingle\b/.test(lower)) return "single";
  const numbered = trimmed.match(/^(?:option\s+)?([1-5])(?:[.)]\s*)?$/i);
  if (numbered) return MARITAL_STATUS_OPTIONS[Number(numbered[1]) - 1]!.id;
  const t = lower.replace(/[\s-]+/g, "_");
  if (t === "union" || t === "civil_union") return "stable_union";
  if (MARITAL_VALUES.has(t)) return t;
  return undefined;
}

function parseBrazilStaysText(raw: string): Array<{ entryDate: string; exitDate?: string }> | "not_sure" | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (isNotSureToken(trimmed)) return "not_sure";

  const stays: Array<{ entryDate: string; exitDate?: string }> = [];
  const lines = trimmed.split(/\n+/);
  for (const line of lines) {
    const parts = line.split(/[,/|]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const entryMatch = parts[0]?.match(/(\d{4}-\d{2}-\d{2})/);
    if (!entryMatch) continue;
    const entryDate = entryMatch[1]!;
    let exitDate: string | undefined;
    if (parts[1]) {
      const exitLower = parts[1].toLowerCase();
      if (!/ongoing|open|present|still|blank|none/.test(exitLower)) {
        const exitMatch = parts[1].match(/(\d{4}-\d{2}-\d{2})/);
        if (exitMatch) exitDate = exitMatch[1];
      }
    }
    stays.push(exitDate ? { entryDate, exitDate } : { entryDate });
  }
  return stays.length > 0 ? stays : undefined;
}

export function parseBool(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "sim"].includes(t)) return true;
  if (["no", "n", "false", "0", "nao", "não"].includes(t)) return false;
  return undefined;
}

function parseBoolOrSkip(text: string): boolean | "not_sure" | "skip" | undefined {
  if (isNotSureToken(text)) return "not_sure";
  if (SKIP_TOKENS.test(text.trim())) return "skip";
  return parseBool(text);
}

export function coerceBoolLike(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return parseBool(raw);
  return undefined;
}

export function needsResidencePermitQuestion(merged: Record<string, unknown>): boolean {
  const status = merged.immigrationStatus;
  if (status === undefined || status === "not_sure") return true;
  const value = String(status);
  return value === "tourist" || value === "none";
}

export function needsFiledBrazilianReturnQuestion(merged: Record<string, unknown>): boolean {
  const last = String(merged.lastFilingCountry ?? "")
    .trim()
    .toUpperCase();
  return last !== "BR" && last !== "BRAZIL";
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
  return [...FISCAL_CORE_FIELDS, ...FISCAL_MAP_FIELDS, ...conditional, ...FISCAL_TAIL_FIELDS];
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
    key === "hasDependentsBrazilOrAbroad" ||
    key === "hasCpf" ||
    key === "hasResidencePermit" ||
    key === "filedBrazilianReturn"
  ) {
    const parsed = parseBoolOrSkip(raw);
    if (parsed === "not_sure" || parsed === "skip") return parsed;
    if (parsed !== undefined) return parsed;
  }
  if (key === "brazilStaysText") {
    const stays = parseBrazilStaysText(raw);
    if (stays === "not_sure") return "not_sure";
    if (stays !== undefined) return stays;
  }
  if (key === "daysInUSACalendarYear") {
    const days = parseDaysInBrazil(raw);
    if (days !== undefined) return days;
  }
  if (key === "dependentsCount") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 0 && n <= 30) return n;
  }
  if (key === "immigrationStatus") {
    const v = parseImmigrationStatus(raw);
    if (v !== undefined) return v;
  }
  if (key === "maritalStatus") {
    const v = parseMaritalStatus(raw);
    if (v !== undefined) return v;
  }
  if (key === "birthDate") {
    const t = raw.trim();
    if (isNotSureToken(t) || SKIP_TOKENS.test(t)) return "not_sure";
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const parsedSlash = parseSlashDate(t);
    if (parsedSlash) return parsedSlash;
    return t;
  }
  const t = raw.trim();
  if (key === "cpf" || key === "foreignTaxId") {
    if (/^(none|n\/a|skip)$/i.test(t)) return undefined;
    return t;
  }
  if (key === "nationalityCountry" || key === "currentResidenceCountry" || key === "lastFilingCountry") {
    if (isNotSureToken(t) || SKIP_TOKENS.test(t)) return t.toLowerCase() === "none" ? "none" : "not_sure";
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
    "hasDependentsBrazilOrAbroad",
    "hasCpf",
    "hasResidencePermit",
    "filedBrazilianReturn"
  ] as const) {
    const v = ctx[k];
    if (typeof v === "string") {
      const parsed = parseBoolOrSkip(v);
      if (parsed === true || parsed === false) ctx[k] = parsed;
    }
  }
}

function isNotSureValue(raw: unknown): boolean {
  return typeof raw === "string" && (isNotSureToken(raw) || raw === "not_sure" || raw === "skip");
}

export function isValidFiscalFieldValue(key: string, raw: unknown): boolean {
  if (
    key === "isFiscalResidentBrazil" ||
    key === "isFiscalResidentUSA" ||
    key === "fiscalResidenceOtherCountry" ||
    key === "hasUSCitizenship" ||
    key === "hasGreenCard" ||
    key === "physicallyLivesInBrazil" ||
    key === "hasPermanentAddressBrazil" ||
    key === "hasPermanentAddressUSA" ||
    key === "hasUSWorkVisa" ||
    key === "hasDependentsBrazilOrAbroad"
  ) {
    return coerceBoolLike(raw) !== undefined;
  }
  if (key === "hasCpf" || key === "hasResidencePermit" || key === "filedBrazilianReturn") {
    return coerceBoolLike(raw) !== undefined || isNotSureValue(raw);
  }
  if (key === "declaredPermanentExitBrazil") {
    return coerceBoolLike(raw) !== undefined || isNotSureValue(raw);
  }
  if (key === "cpf" || key === "foreignTaxId") {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === "string" && /^(none|n\/a|skip)$/i.test(raw.trim())) return true;
    return typeof raw === "string" && raw.trim().length >= 1;
  }
  if (key === "daysInUSACalendarYear") {
    if (raw === "not_sure" || isNotSureValue(raw)) return true;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 366;
  }
  if (key === "brazilStaysText") {
    if (raw === "not_sure" || isNotSureValue(raw)) return true;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.every(
        (stay) =>
          stay &&
          typeof stay === "object" &&
          typeof (stay as { entryDate?: unknown }).entryDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test((stay as { entryDate: string }).entryDate)
      );
    }
    return false;
  }
  if (key === "dependentsCount") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 30;
  }
  if (key === "immigrationStatus") {
    return raw === "not_sure" || (typeof raw === "string" && IMMIGRATION_VALUES.has(raw));
  }
  if (key === "maritalStatus") {
    return raw === "not_sure" || (typeof raw === "string" && MARITAL_VALUES.has(raw));
  }
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (key === "nationalityCountry" || key === "currentResidenceCountry") {
    const normalized = normalizeCountryCode(String(raw));
    return /^[A-Za-z]{2,3}$/.test(normalized);
  }
  if (key === "lastFilingCountry") {
    if (t === "none" || isNotSureToken(t) || t === "not_sure") return true;
    return /^[A-Za-z]{2,3}$/.test(normalizeCountryCode(t));
  }
  if (key === "birthDate") {
    if (typeof raw !== "string") return false;
    const coerced = coerceFiscalFieldValue("birthDate", raw);
    return typeof coerced === "string" && /^\d{4}-\d{2}-\d{2}$/.test(coerced);
  }
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
    key === "physicallyLivesInBrazil" ||
    key === "hasPermanentAddressBrazil" ||
    key === "hasPermanentAddressUSA" ||
    key === "hasUSWorkVisa" ||
    key === "hasDependentsBrazilOrAbroad"
  ) {
    return parseBool(t) !== undefined;
  }
  if (key === "hasCpf" || key === "hasResidencePermit" || key === "filedBrazilianReturn") {
    return parseBoolOrSkip(t) !== undefined;
  }
  if (key === "declaredPermanentExitBrazil") {
    return parseBoolOrSkip(t) !== undefined;
  }
  if (key === "cpf" || key === "foreignTaxId") {
    if (/^(none|n\/a|skip)$/i.test(t)) return true;
    return /\d/.test(t) && t.length >= 4;
  }
  if (key === "daysInUSACalendarYear") {
    return parseDaysInBrazil(t) !== undefined;
  }
  if (key === "brazilStaysText") {
    return parseBrazilStaysText(t) !== undefined || isNotSureToken(t);
  }
  if (key === "dependentsCount") {
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 && n <= 30;
  }
  if (key === "immigrationStatus") return parseImmigrationStatus(t) !== undefined;
  if (key === "maritalStatus") return parseMaritalStatus(t) !== undefined;
  if (key === "email") return t.includes("@") && t.includes(".");
  if (key === "birthDate") {
    return isNotSureToken(t) || SKIP_TOKENS.test(t) || looksLikeDateAnswer(t);
  }
  if (key === "nationalityCountry" || key === "currentResidenceCountry" || key === "lastFilingCountry") {
    if (isNotSureToken(t) || SKIP_TOKENS.test(t)) return true;
    const normalized = normalizeCountryCode(t);
    return /^[A-Za-z]{2,3}$/.test(normalized);
  }
  if (key === "fullName") {
    const lower = t.toLowerCase();
    if (/^(what|how|why|when|where|who|which|can|could|should|is|are|do|does|tell me about)\b/.test(lower)) {
      return false;
    }
    if (/\?$/.test(t)) return false;
    return /[A-Za-zÀ-ÿ]/.test(t) && t.length >= 2;
  }
  return true;
}

const BOOLEAN_FISCAL_FIELD_KEYS = new Set([
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
  "hasDependentsBrazilOrAbroad",
  "hasCpf",
  "hasResidencePermit",
  "filedBrazilianReturn"
]);

export function isBooleanFiscalField(key: string): boolean {
  return BOOLEAN_FISCAL_FIELD_KEYS.has(key);
}

const FISCAL_FIELD_ASSISTANT_HINTS: Record<string, RegExp[]> = {
  currentResidenceCountry: [/actually live today/i, /currently live in/i, /country do you (currently )?live/i],
  nationalityCountry: [/nationality/i, /country of citizenship/i],
  isFiscalResidentBrazil: [/tax resident of brazil/i, /fiscal resident of brazil/i],
  isFiscalResidentUSA: [/tax resident of the united states/i, /fiscal resident of the united states/i, /fiscal resident of the u\.?s\.?/i],
  fiscalResidenceOtherCountry: [
    /another country besides brazil/i,
    /fiscal residence in any other country/i,
    /other country besides brazil and the usa/i
  ],
  daysInUSACalendarYear: [/days.*(united states|u\.?s\.?)/i, /spent in the united states/i],
  brazilStaysText: [/entry and exit dates/i, /brazil entry/i, /record your brazil/i],
  hasUSCitizenship: [/u\.?s\.? citizenship/i],
  hasGreenCard: [/green card/i],
  declaredPermanentExitBrazil: [
    /departure declaration/i,
    /saída definitiva/i,
    /definitive exit.*brazil/i,
    /exit declaration from brazil/i
  ],
  hasCpf: [/\bcpf\b/i],
  hasResidencePermit: [/residence permit/i],
  immigrationStatus: [/immigration status/i],
  lastFilingCountry: [/file(d)? a tax return last year/i, /where did you file/i],
  filedBrazilianReturn: [/filed a brazilian tax return/i],
  maritalStatus: [/marital status/i],
  dependentsCount: [/how many dependents/i, /dependents do you have/i],
  physicallyLivesInBrazil: [/currently in brazil/i, /physically live in brazil/i],
  hasDependentsBrazilOrAbroad: [/dependents/i],
  birthDate: [/birth date/i, /date of birth/i, /when (is|was|were) your birth/i, /when (is|were) you born/i],
  fullName: [/name should we use/i, /full (legal )?name/i, /what is your name/i, /provide your name/i],
  email: [/\bemail\b/i, /e-mail/i]
};

/** Match the fiscal field the assistant most recently asked about (among pending keys). */
export function inferFiscalFieldFromAssistantText(text: string, pendingKeys: string[]): string | undefined {
  let bestKey: string | undefined;
  let bestPos = -1;
  for (const key of pendingKeys) {
    const hints = FISCAL_FIELD_ASSISTANT_HINTS[key];
    if (!hints) continue;
    for (const re of hints) {
      const m = re.exec(text);
      if (m && m.index >= bestPos) {
        bestPos = m.index;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

export function getNextFiscalField(
  context: Record<string, unknown>
): { key: string; prompt: string } | null {
  for (const { key, prompt } of getActiveFiscalFieldOrder(context)) {
    if (!isValidFiscalFieldValue(key, context[key])) return { key, prompt };
  }
  return null;
}

export function getFiscalQuestionForContext(context: Record<string, unknown>): string {
  return getNextFiscalField(context)?.prompt ?? "Say **next step** when you are ready to continue.";
}

export function formatFiscalValidationError(): string {
  return "Some answers did not look right. Let's go through your fiscal profile again from the start.";
}

export function prepareFiscalPayloadForValidation(merged: Record<string, unknown>): Record<string, unknown> {
  const out = { ...merged };
  applyDefaultPrimaryCurrency(out);
  coerceFiscalBooleansInPlace(out);

  const stripKeys = [
    "daysInUSACalendarYear",
    "brazilStaysText",
    "immigrationStatus",
    "maritalStatus",
    "lastFilingCountry",
    "hasCpf",
    "hasResidencePermit",
    "filedBrazilianReturn",
    "declaredPermanentExitBrazil"
  ];
  for (const key of stripKeys) {
    if (isNotSureValue(out[key]) || out[key] === "skip") delete out[key];
  }

  const staysRaw = out.brazilStaysText;
  if (Array.isArray(staysRaw) && staysRaw.length > 0) {
    out.brazilStays = staysRaw;
  }
  delete out.brazilStaysText;

  if (Array.isArray(out.brazilStays) && out.brazilStays.length > 0) {
    const sorted = [...out.brazilStays].sort((a, b) =>
      String((a as { entryDate: string }).entryDate).localeCompare(
        String((b as { entryDate: string }).entryDate)
      )
    );
    out.firstEntryBrazilDate = (sorted[0] as { entryDate: string }).entryDate;
  }
  const count = out.dependentsCount;
  if (typeof count === "number") {
    out.hasDependentsBrazilOrAbroad = count > 0;
  }
  return out;
}
