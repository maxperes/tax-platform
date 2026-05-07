import {
  fiscalResidenceSchema,
  incomeSourceSchema,
  deductionSchema,
  capitalGainCalculationSchema,
  type ConversationState,
  type FiscalProfile,
  buildRuleVersionStamp,
  DATA_PACK_BR_2026,
  DATA_PACK_US_2026
} from "@tax-platform/shared";
import {
  deriveFiscalProfile,
  classifyIncome,
  detectTaxableEventsFromIncomes,
  validateDeductionForMvp,
  computeCapitalGain,
  aggregateMonthlyCarnetLeao,
  buildTaxReportSummary,
  jurisdictionsForProfile,
  getBrRulePack,
  getUsRulePack,
  buildBrAnnualEstimate,
  buildUsAnnualEstimate,
  applyCarneLeaoTaxToItems,
  resolveBrlFromIncome,
  resolveUsdFromIncome
} from "@tax-platform/rules";
import type { Prisma, TaxCalculation } from "@prisma/client";
import type OpenAI from "openai";
import type { FiscalResidence, IncomeSource } from "@tax-platform/shared";
import { prisma } from "../db.js";
import { rewriteSafeResponse, runAssistantWithTools } from "./llm.js";
import { config } from "../config.js";
import {
  defaultOriginCountryForCurrency,
  inferIncomeKindFromChat,
  inferPayerNameFromIncomeChatLine,
  parseMonthlySalaryLines,
  parsePaymentLines
} from "./income-multi-parse.js";
import {
  conversationStateRank,
  healStateIfAssistantAnnouncedLaterStep,
  normalizeForwardAdvance
} from "./conversation-state-heal.js";
import { parseRewindTargetStep } from "./conversation-rewind.js";
import {
  isEventsSkipIntent,
  lastAssistantAskedEventNoneConfirmation
} from "./taxable-events-none.js";
import {
  assistantAcknowledgesNoTaxableEvents,
  isExplicitGenerateReportIntent,
  lastAssistantOfferedSummary
} from "./summary-offer.js";

/** Parsed payment-line text can create IncomeSource rows without rewinding from Done. */
const STATES_ALLOWING_CHAT_INCOME_AMENDMENT = new Set<ConversationState>([
  "income_capture",
  "events",
  "deductions",
  "capital_gain",
  "monthly_calc",
  "report",
  "complete"
]);

const FISCAL_PROFILE_CONFIRM_PENDING_KEY = "_fiscalProfileConfirmPending";

const FISCAL_FIELD_ORDER: { key: string; prompt: string }[] = [
  { key: "nationalityCountry", prompt: "What is your country of nationality (ISO code, e.g. BR, US)?" },
  { key: "currentResidenceCountry", prompt: "Which country do you currently live in (ISO code)?" },
  { key: "birthDate", prompt: "What is your date of birth (YYYY-MM-DD)?" },
  { key: "primaryCurrency", prompt: "What is your main currency for reporting (ISO, e.g. BRL, USD)?" },
  {
    key: "isFiscalResidentBrazil",
    prompt: "Are you a fiscal resident of Brazil for tax purposes? (yes/no)"
  },
  { key: "isFiscalResidentUSA", prompt: "Are you a fiscal resident of the United States? (yes/no)" },
  {
    key: "fiscalResidenceOtherCountry",
    prompt: "Do you have fiscal residence in any other country besides Brazil and the USA? (yes/no)"
  },
  { key: "fullName", prompt: "Great, now what is your full legal name?" },
  { key: "email", prompt: "And what email should we use for your account notifications?" }
];

function getContext(session: { contextJson: Prisma.JsonValue | null }): Record<string, unknown> {
  return (session.contextJson as Record<string, unknown>) ?? {};
}

function parseBool(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "sim"].includes(t)) return true;
  if (["no", "n", "false", "0", "nao", "não"].includes(t)) return false;
  return undefined;
}

function normalizeDateInput(raw: string): string | undefined {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!mmddyyyy) return undefined;
  const month = Number(mmddyyyy[1]);
  const day = Number(mmddyyyy[2]);
  const year = Number(mmddyyyy[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function coerceValue(key: string, raw: string): unknown {
  if (key === "fiscalResidenceOtherCountry" || key.startsWith("is")) {
    const b = parseBool(raw);
    if (b !== undefined) return b;
  }
  if (key === "birthDate") {
    return normalizeDateInput(raw) ?? raw.trim();
  }
  return raw.trim();
}

/** Flatten nested `fiscalResidence` and map common LLM alias keys to RF-001 names. */
const FISCAL_FIELD_ALIASES: Record<string, string> = {
  nationality: "nationalityCountry",
  countryOfNationality: "nationalityCountry",
  country_of_nationality: "nationalityCountry",
  fiscalResidenceCountry: "currentResidenceCountry",
  currentCountry: "currentResidenceCountry",
  residenceCountry: "currentResidenceCountry",
  countryOfResidence: "currentResidenceCountry",
  countryOfFiscalResidence: "currentResidenceCountry",
  dob: "birthDate",
  dateOfBirth: "birthDate",
  date_of_birth: "birthDate",
  currency: "primaryCurrency",
  mainCurrency: "primaryCurrency"
};

function normalizeFiscalAliasKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  for (const [alias, canonical] of Object.entries(FISCAL_FIELD_ALIASES)) {
    const v = out[alias];
    if (v === undefined || v === null || v === "") continue;
    if (out[canonical] === undefined || out[canonical] === null || out[canonical] === "") {
      out[canonical] = v;
    }
    delete out[alias];
  }
  return out;
}

function expandFiscalResidenceToolPayload(data: Record<string, unknown>): Record<string, unknown> {
  const nested = data.fiscalResidence;
  const { fiscalResidence: _drop, ...rest } = data;
  let flat: Record<string, unknown> = { ...rest };
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    flat = { ...(nested as Record<string, unknown>), ...flat };
  }
  return normalizeFiscalAliasKeys(flat);
}

function coerceFiscalBooleansInPlace(ctx: Record<string, unknown>): void {
  for (const k of ["isFiscalResidentBrazil", "isFiscalResidentUSA", "fiscalResidenceOtherCountry"] as const) {
    const v = ctx[k];
    if (typeof v === "string") {
      const b = parseBool(v);
      if (b !== undefined) ctx[k] = b;
    }
  }
}

function coerceBoolLike(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return parseBool(raw);
  return undefined;
}

export function initialAssistantMessage(): string {
  return `Hi, I will guide you step by step. We will start with the tax-related questions and ask contact details at the end. ${FISCAL_FIELD_ORDER[0].prompt}`;
}

function fiscalProfileConfirmPromptText(): string {
  return "Reply **yes** to use this saved profile and continue to income, or **no** to replace it and answer the fiscal questions again from the start.";
}

function isFiscalProfileConfirmPending(context: Record<string, unknown>): boolean {
  return context[FISCAL_PROFILE_CONFIRM_PENDING_KEY] === true;
}

function formatFiscalResidenceSummaryForUser(data: FiscalResidence): string {
  const yn = (b: boolean) => (b ? "yes" : "no");
  return [
    "**What we have on file**",
    `- **Name:** ${data.fullName}`,
    `- **Email:** ${data.email}`,
    `- **Nationality (ISO):** ${data.nationalityCountry}`,
    `- **Country of residence (ISO):** ${data.currentResidenceCountry}`,
    `- **Date of birth:** ${data.birthDate}`,
    `- **Main currency:** ${data.primaryCurrency}`,
    `- **Fiscal resident of Brazil:** ${yn(data.isFiscalResidentBrazil)}`,
    `- **Fiscal resident of the USA:** ${yn(data.isFiscalResidentUSA)}`,
    `- **Fiscal residence in another country (not BR/US):** ${yn(data.fiscalResidenceOtherCountry)}`
  ].join("\n");
}

/** First assistant message when a validated profile already exists for this user and tax year. */
export function buildAssistantMessageForExistingFiscalProfile(input: {
  taxYear: number;
  data: FiscalResidence;
  derivedProfile: string;
  requiresAdditionalReview: boolean;
}): string {
  const profileLine = describeFiscalProfileForRecap(input.derivedProfile);
  const review = input.requiresAdditionalReview
    ? "\n\n**Note:** this profile is flagged for possible **expert review**."
    : "";
  return (
    `We already have a **fiscal profile on file** for **${input.taxYear}** (modeled as **${profileLine}**).${review}\n\n` +
    `${formatFiscalResidenceSummaryForUser(input.data)}\n\n` +
    fiscalProfileConfirmPromptText()
  );
}

function isConfirmUseStoredFiscalProfile(text: string): boolean {
  const t = text.trim().toLowerCase();
  const b = parseBool(t);
  if (b === true) return true;
  if (b === false) return false;
  return (
    /^(ok|okay|sure|yep|yeah)\b/.test(t) ||
    /\b(use|keep)\b.*\b(it|profile|saved|this)\b/.test(t) ||
    /\b(it|profile|saved|this)\b.*\b(use|keep)\b/.test(t) ||
    /\b(that|looks?)\s+(is\s+)?(fine|good|correct)\b/.test(t) ||
    /\bsounds?\s+good\b/.test(t)
  );
}

function isConfirmReplaceFiscalProfile(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (parseBool(t) === false) return true;
  if (parseBool(t) === true) return false;
  return (
    /^no\b/.test(t) ||
    /\b(replace|start\s+over|re-?enter|from\s+scratch|enter\s+again|discard|ignore)\b/.test(t)
  );
}

function stripFiscalProfileConfirmFlag(context: Record<string, unknown>): Record<string, unknown> {
  const next = { ...context };
  delete next[FISCAL_PROFILE_CONFIRM_PENDING_KEY];
  return next;
}

function buildSystemPrompt(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>
): string {
  const incomeCaptureBlock =
    state === "income_capture"
      ? `
Income capture (critical):
- Each distinct payment must be one database row: one gross amount, one currency, one payment date, periodicity (monthly | annual | one_off | recurring), payerName, originCountry (ISO), incomeType, and nature (work | investment | retirement | asset | corporate | trust | other).
- **submit_income_source** must pass the full **income** object matching the schema. If any required field is wrong or omitted, the row is **not** saved—double-check **paymentDate** is **YYYY-MM-DD** and **originalCurrency** is 3 letters.
- Monthly pay: set **periodicity** to **monthly**, **grossAmount** to the monthly gross, **paymentDate** to a representative pay date in ${taxYear} (e.g. last day of a month).
- If the user lists several payments in one message (e.g. multiple "amount CURRENCY YYYY-MM-DD" lines), call submit_income_source once per payment — never merge multiple dates/amounts into a single tool call.
- Short lines like **10900 USD per month** may be saved by the server without your tool call; still call **submit_income_source** when you have a complete structured row.
- Infer missing payer or country only when clearly implied; otherwise ask one short follow-up after saving.`
      : "";

  return `You are a warm, concise tax intake assistant for year ${taxYear}. Current workflow step: ${state}.
${incomeCaptureBlock}

Hard scope rules:
- ONLY help the user complete this intake workflow (collecting structured answers, clarifying unclear answers, and explaining what the NEXT question is asking).
- You MAY answer short trust/compliance questions related to this service (privacy, data storage/retention, security, access control, deletion/export requests) and then return to intake.
- Do NOT answer unrelated questions (general knowledge, news, coding, entertainment, personal advice, politics, sports, recipes, etc.). If the user asks something unrelated, refuse briefly and return to the current intake task.
- Do NOT compute or guarantee final tax outcomes; never present numbers as definitive filing results.
- In fiscal_residence, prioritize tax-relevant fields first and leave name/email for the final part of that step.
- In fiscal_residence, do NOT ask for a full postal address, street, apartment, or similar. Only ask for fields that exist in the fiscal residence schema (e.g. ISO country codes, birth date, currency, yes/no residency questions, then name and email at the end). If the user offers an address, thank them and say we will capture address details later if needed — continue with the next schema question.
- In fiscal_residence, after **each** user message you MUST call **submit_fiscal_residence** with \`data\` containing **every** fiscal field gathered so far (copy from Context so far, then add or update the latest answer). Sending only the last field drops prior answers from the session.

Never compute final taxes yourself. Use function tools to save structured data.
- When the user says next step, continue, or similar, call the advance_conversation_state tool if the current step is complete; otherwise briefly say what is still missing.
- Whenever you move the user to a different workflow step, you MUST call advance_conversation_state with the correct nextState in the same turn. Do not only describe the new step in text — the UI reads the tool-updated step.
- advance_conversation_state must never request a step earlier in the flow than the current one (e.g. do not go from deductions back to events).
- In income_capture, if the user clearly signals they are finished listing incomes (e.g. "that's all", "no more income", "I'm done"), call advance_conversation_state with nextState "events" without insisting on another income row.
- In events, if the user confirms there are no taxable events (e.g. "none", "no taxable events", "nothing to report"), call advance_conversation_state with nextState "deductions" — do not repeat the same question.
- If you asked whether to summarize (or to move to the report step with a summary) and the user clearly agrees (e.g. "yes"), call advance_conversation_state to "complete" after saving the report—do not repeat the same question or claim you are stuck in a cycle. Do not leave them on report with only a generic "current step" line.
- On the report step, if the user asks to generate, build, or finalize the report in their own words, save the report and advance to complete—do not ask again for permission to summarize unless something is still missing.
- From **complete**, the user may say they want to **go back** to an earlier step (income, deductions, report, etc.) to edit—the server may move them back; do not insist they only start a brand-new chat unless they ask for that.
- From **complete**, if they ask to **generate or regenerate** the report again, save another report row and confirm—do not re-litigate taxable events unless they returned to that step.
- From **complete** (or any later step), if the user pastes a line like **15000 USD 2026-01-25** or **15k USD in 2026-01-25**, the server may save it as income automatically—tell them to **regenerate the report** so the export picks it up.
Context so far: ${JSON.stringify(context).slice(0, 12000)}
Ask one short question at a time when information is missing.`;
}

/** Flat tool merges + optional nested `fiscalResidence` from prior saves. */
function getFiscalResidenceMergedFields(context: Record<string, unknown>): Record<string, unknown> {
  const nested = context.fiscalResidence;
  const fromNested =
    nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : {};
  const merged = normalizeFiscalAliasKeys({ ...fromNested, ...context });
  const cr = merged.currentResidenceCountry;
  if (typeof cr === "string" && cr.trim().toLowerCase() === "same") {
    const nat = merged.nationalityCountry;
    if (typeof nat === "string" && nat.trim().length >= 2) {
      merged.currentResidenceCountry = nat.trim().toUpperCase();
    }
  }
  return merged;
}

function isValidFiscalResidenceFieldValue(key: string, raw: unknown): boolean {
  if (key === "isFiscalResidentBrazil" || key === "isFiscalResidentUSA" || key === "fiscalResidenceOtherCountry") {
    return coerceBoolLike(raw) !== undefined;
  }
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (key === "nationalityCountry" || key === "currentResidenceCountry") return t.length >= 2;
  if (key === "birthDate") return /^\d{4}-\d{2}-\d{2}$/.test(t);
  if (key === "primaryCurrency") return /^[A-Za-z]{3}$/.test(t);
  if (key === "fullName") return t.length >= 1;
  if (key === "email") return fiscalResidenceSchema.shape.email.safeParse(t).success;
  return false;
}

function getFiscalResidenceCurrentQuestion(context: Record<string, unknown>): string {
  if (isFiscalProfileConfirmPending(context)) {
    return fiscalProfileConfirmPromptText();
  }
  const merged = getFiscalResidenceMergedFields(context);
  for (const { key, prompt } of FISCAL_FIELD_ORDER) {
    if (!isValidFiscalResidenceFieldValue(key, merged[key])) {
      return prompt;
    }
  }
  return "Say **next step** when you are ready to continue to income sources.";
}

function looksLikeFiscalResidenceAnswer(key: string, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (key === "isFiscalResidentBrazil" || key === "isFiscalResidentUSA" || key === "fiscalResidenceOtherCountry") {
    return parseBool(t) !== undefined;
  }
  if (key === "email") return t.includes("@") && t.includes(".");
  if (key === "birthDate") return normalizeDateInput(t) !== undefined;
  if (key === "primaryCurrency") return /^[A-Za-z]{3}$/.test(t);
  if (key === "nationalityCountry" || key === "currentResidenceCountry") return /^[A-Za-z]{2,3}$/.test(t);
  if (key === "fullName") return /[A-Za-zÀ-ÿ]/.test(t) && t.length >= 2;
  return true;
}

function isLikelyOffTopicUserMessage(
  state: ConversationState,
  context: Record<string, unknown>,
  userContent: string
): boolean {
  const t = userContent.trim();
  if (!t) return false;

  const lower = t.toLowerCase();
  const meta =
    /^(help|repeat|start over|reset|cancel|stop|next(\s+step)?|continue|proceed|go\s+ahead|move\s+on)\b/i.test(lower);
  if (meta) return false;

  if (parsePaymentLines(t).length >= 1) return false;

  if (state === "fiscal_residence") {
    if (isFiscalProfileConfirmPending(context)) {
      if (isConfirmUseStoredFiscalProfile(t) || isConfirmReplaceFiscalProfile(t)) return false;
      return true;
    }
    const merged = getFiscalResidenceMergedFields(context);
    const expectedKey = FISCAL_FIELD_ORDER.find((f) => !isValidFiscalResidenceFieldValue(f.key, merged[f.key]))?.key;
    if (!expectedKey) return false;
    return !looksLikeFiscalResidenceAnswer(expectedKey, t);
  }

  if (state === "income_capture") {
    const incomeKeywords =
      /\b(income|salary|wage|bonus|dividend|interest|rent|aluguel|renda|carn[eê]|carne|le[aã]o|trust|rsu|stock|crypto|usd|brl|foreign|exterior|employer|payer|payment|date|amount|currency)\b/i;
    if (incomeKeywords.test(t)) return false;

    const chitChat =
      /\b(weather|joke|recipe|movie|sport|football|soccer|nba|who won|translate|poem|story|chatgpt|linux|windows|macos|javascript|python)\b/i;
    if (chitChat.test(t)) return true;
  }

  const globalChitChat =
    /\b(weather|joke|recipe|movie|sport|football|soccer|nba|who won|translate|poem|story|linux|windows|macos|javascript|python)\b/i;
  if (globalChitChat.test(lower)) return true;

  return false;
}

function isTrustOrComplianceConcern(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  const trustKeywords =
    /\b(store|stored|save|saved|retain|retention|privacy|private|data|security|secure|encrypt|encrypted|access|who can access|share|shared|delete|deletion|erase|remove|export|download my data|confidential|confidentiality|consent|lgpd|gdpr)\b/i;
  return trustKeywords.test(lower);
}

function isPrivacyPolicyLocationQuestion(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return /\b(where|find|link|url|read|see|access)\b.*\b(privacy policy|privacy notice|data policy)\b|\b(privacy policy|privacy notice|data policy)\b.*\b(where|find|link|url|read|see|access)\b/i.test(
    lower
  );
}

function trustConcernCoreResponse(taxYear: number, userContent: string): string {
  if (isPrivacyPolicyLocationQuestion(userContent)) {
    return config.privacyPolicyUrl
      ? `You can read our privacy policy here: ${config.privacyPolicyUrl}`
      : "The privacy policy URL is not configured in this environment yet. Please contact support/admin for the official policy link.";
  }
  return (
    `Yes, we store the information you provide in this tax intake for ${taxYear} so we can prepare your assessment and keep your session progress. ` +
    "Access should be limited to authorized service operations and support. If you need data deletion/export details, please request it and we can guide you."
  );
}

function intakeRedirectForState(state: ConversationState, context: Record<string, unknown>): string {
  if (state === "fiscal_residence") {
    if (isFiscalProfileConfirmPending(context)) {
      return fiscalProfileConfirmPromptText();
    }
    return `Now, let's continue: ${getFiscalResidenceCurrentQuestion(context)}`;
  }
  if (state === "income_capture") {
    return "Add income using **amount**, **currency**, and **date** (or **per month** for monthly gross). Use the **income form** for a table view.";
  }
  if (state === "events") {
    return "Next, list any **taxable events** for this year (for example vesting, asset sales, large distributions). Describe one event at a time here in chat.";
  }
  if (state === "deductions") {
    return "List **deductions** you want to claim (type, amount, currency, tax period), one at a time, or say you have none.";
  }
  if (state === "capital_gain") {
    return "Next, we capture **capital gains** (asset type, acquisition and sale dates/values, currencies). Describe one disposition at a time here in chat.";
  }
  if (state === "monthly_calc") {
    return "We review **monthly tax** totals built from your income timeline. Check that months and amounts look reasonable, or say what to fix.";
  }
  if (state === "report") {
    return "We **finalize your year summary** from what you entered. Answer the assistant when asked if you would like a short recap—your **yes** saves a report draft and shows counts here in chat.";
  }
  if (state === "complete") {
    return "This year is **marked complete**. Say **go back to income**, **deductions**, **events**, **report**, or another step to change earlier answers, or ask to **regenerate the report**. Download the latest report from the bar under the steps when it appears.";
  }
  return `Current step: **${state}**. Please continue with the information requested for this step.`;
}

async function trustConcernResponseWithTone(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  userContent: string,
  userId: string
): Promise<string> {
  const deterministicCore = trustConcernCoreResponse(taxYear, userContent);
  const intakeRedirect = await resolveIntakeRedirect(state, context, userId, taxYear);
  if (!config.llmEnabled) return `${deterministicCore}\n\n${intakeRedirect}`;
  try {
    const rewrittenCore = await rewriteSafeResponse({
      userMessage: userContent,
      deterministicAnswer: deterministicCore
    });
    // Always append redirect after rewrite so the flow continues reliably.
    return `${rewrittenCore}\n\n${intakeRedirect}`;
  } catch {
    return `${deterministicCore}\n\n${intakeRedirect}`;
  }
}

function isAdvanceIntent(userContent: string): boolean {
  return /^(next(\s+step)?|continue|proceed|go\s+ahead|move\s+on)\b/i.test(userContent.trim());
}

/** User is done listing incomes (possibly zero); advance to the next workflow step. */
function isIncomeCaptureDoneIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  if (/^(next(\s+step)?|continue|proceed|go\s+ahead|move\s+on)\b/i.test(lower)) return false;
  return (
    /^that['']?s\s+all\b/i.test(lower) ||
    /^that['']?s\s+it\b/i.test(lower) ||
    /^all\s+done\b/i.test(lower) ||
    /^no\s+more(\s+income)?\b/i.test(lower) ||
    /^i['']?m\s+done\b/i.test(lower) ||
    /^i\s+am\s+done\b/i.test(lower) ||
    /^nothing\s+else\b/i.test(lower) ||
    /^finished\b/i.test(lower) ||
    /^done\s+with\s+income\b/i.test(lower)
  );
}

function lastAssistantContent(msgs: { role: string; content: string }[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === "assistant") return m.content;
  }
  return "";
}

function isDeductionsSkipIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /^no\s+deductions?\b/i.test(lower) ||
    /^none\b/i.test(lower) ||
    /^n\/a\b/i.test(lower) ||
    /^zero\s+deductions?\b/i.test(lower) ||
    /^nothing\s+to\s+deduct\b/i.test(lower) ||
    /^not\s+claim(ing)?\s+(any\s+)?deductions?\b/i.test(lower) ||
    /^skip\s+deductions?\b/i.test(lower)
  );
}

function isShortAffirmativeAdvance(userContent: string): boolean {
  const t = userContent.trim().toLowerCase();
  if (!t) return false;
  return /^(yes|yep|yeah|sure|ok|okay)\b/i.test(t) && t.length < 48;
}

function lastAssistantAskedProceed(lastAssistantText: string): boolean {
  const lower = lastAssistantText.toLowerCase();
  return (
    /\bproceed\s+to\s+(the\s+)?next\s+step\b/i.test(lower) ||
    /\bwould\s+you\s+like\s+to\s+proceed\b/i.test(lower) ||
    /\bmove\s+on\s+to\s+the\s+next\b/i.test(lower)
  );
}

async function postToolCallAssistantText(
  userId: string,
  prevState: ConversationState,
  newState: ConversationState,
  taxYear: number,
  context: Record<string, unknown>
): Promise<string> {
  if (prevState === "fiscal_residence" && newState === "income_capture") {
    const fr = context.fiscalResidence;
    const parsed =
      fr && typeof fr === "object"
        ? fiscalResidenceSchema.safeParse(fr)
        : ({ success: false } as const);
    if (parsed.success) {
      const profile = deriveFiscalProfile(parsed.data);
      const review = profile.requiresAdditionalReview ? " This case may need expert review." : "";
      const name = parsed.data.fullName?.trim();
      const thanks = name ? `Thanks, **${name}**. ` : "";
      return (
        `${thanks}Your fiscal profile for **${taxYear}** is saved as **${profile.profile}**.${review}\n\n` +
        (await incomeCheckpointMessage(userId, taxYear))
      );
    }
    return (
      `Your fiscal profile for **${taxYear}** is saved.\n\n` + (await incomeCheckpointMessage(userId, taxYear))
    );
  }
  if (newState !== prevState) {
    const stepLabel = newState.replace(/_/g, " ");
    return `You are now on **${stepLabel}**.\n\n${await resolveIntakeRedirect(newState, context, userId, taxYear)}`;
  }
  return `I saved that.\n\n${await resolveIntakeRedirect(newState, context, userId, taxYear)}`;
}

async function offTopicRedirect(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  userId: string
): Promise<string> {
  if (state === "fiscal_residence") {
    return `I can only help you complete this tax intake for **${taxYear}**. I can’t answer unrelated questions here.\n\n${getFiscalResidenceCurrentQuestion(context)}`;
  }
  if (state === "income_capture") {
    return (
      `I can only help you complete this tax intake for **${taxYear}**. I can’t answer unrelated questions here.\n\n` +
      (await incomeCheckpointMessage(userId, taxYear))
    );
  }
  return `I can only help you complete this tax intake for **${taxYear}**. I can’t answer unrelated questions here.\n\nCurrent step: **${state}**. Please continue with the information requested for this step.`;
}

function escapeIncomeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function incomeCheckpointMessage(userId: string, taxYear: number): Promise<string> {
  const rows = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      payerName: true,
      originCountry: true,
      incomeType: true,
      grossAmount: true,
      originalCurrency: true,
      paymentDate: true,
      periodicity: true
    }
  });

  const cta =
    "**Add more** with a line like **`10900 USD 2026-01-31`** or **`10900 USD per month`** for monthly gross (if you omit a date we anchor to January of this tax year). Say **that's all** when you are finished.\n\n" +
    "To edit rows in a **table**, open the **income form** in the app.";

  if (rows.length === 0) {
    return `${cta}\n\n_Income on file: **0** rows._`;
  }

  const header = `**Income on file (${rows.length})** — confirm this list or say what to change.\n\n`;
  const table =
    `| # | Payer | Country | Type | Amount | Paid | Period |\n|---|-------|---------|------|--------|------|--------|\n` +
    rows
      .map(
        (r, i) =>
          `| ${i + 1} | ${escapeIncomeTableCell(r.payerName)} | ${r.originCountry} | ${r.incomeType} | ${r.grossAmount.toNumber()} ${r.originalCurrency} | ${r.paymentDate.toISOString().slice(0, 10)} | ${r.periodicity} |`
      )
      .join("\n");

  return `${header}${table}\n\n${cta}`;
}

async function resolveIntakeRedirect(
  state: ConversationState,
  context: Record<string, unknown>,
  userId: string,
  taxYear: number
): Promise<string> {
  if (state === "income_capture") {
    return incomeCheckpointMessage(userId, taxYear);
  }
  return intakeRedirectForState(state, context);
}

/** OpenAI tool args sometimes omit the nested wrapper; accept root-level fields when they clearly match the payload. */
function toolNestedOrFlatArgs(
  args: Record<string, unknown>,
  nestedKey: string,
  looksLikePayload: (a: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
  const nested = args[nestedKey];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  if (looksLikePayload(args)) return args;
  return undefined;
}

async function persistIncomeSourceRow(userId: string, taxYear: number, income: IncomeSource): Promise<void> {
  const fpRow = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const derived = (fpRow?.derivedProfile ?? "undetermined") as FiscalProfile;
  const classified = classifyIncome(income, derived);
  await prisma.incomeSource.create({
    data: {
      userId,
      taxYear,
      payerName: classified.payerName,
      originCountry: classified.originCountry,
      incomeType: classified.incomeType,
      grossAmount: classified.grossAmount,
      originalCurrency: classified.originalCurrency,
      paymentDate: new Date(classified.paymentDate),
      periodicity: classified.periodicity,
      taxPaidOriginCountry: classified.taxPaidOriginCountry ?? null,
      withholdingTax: classified.withholdingTax ?? null,
      hasProofDocument: classified.hasProofDocument ?? null,
      destinationAccountHint: classified.destinationAccountHint ?? null,
      transferredToBrazil: classified.transferredToBrazil ?? null,
      remainedAbroad: classified.remainedAbroad ?? null,
      nature: classified.nature,
      notes: classified.notes ?? null,
      exchangeRateToBrl: classified.exchangeRateToBrl ?? null,
      grossAmountBrl: classified.grossAmountBrl ?? null,
      classification: classified.classification as Prisma.InputJsonValue
    }
  });
}

type ApplyToolCallsResult = { incomeRowsSaved: number };

async function applyToolCalls(
  userId: string,
  taxYear: number,
  sessionId: string,
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  session: { state: string; contextJson: Prisma.JsonValue | null }
): Promise<ApplyToolCallsResult> {
  let context = getContext(session);
  let state = session.state as ConversationState;
  let requiresReview = false;
  let incomeRowsSaved = 0;
  const fpRowForCapital = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const capitalJurisdiction: "BR" | "US" =
    fpRowForCapital?.derivedProfile === "resident_usa" ? "US" : "BR";

  for (const call of toolCalls) {
    if (call.type !== "function") continue;
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }

    if (name === "submit_fiscal_residence") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      const flat = expandFiscalResidenceToolPayload(data);
      // Do not merge an existing FiscalResidenceProfile row here: a "new chat" for the same
      // user+year would inherit the old answers and a single new field (e.g. nationality) could
      // satisfy the full schema and skip the whole step incorrectly.
      context = { ...context, ...flat };
      coerceFiscalBooleansInPlace(context);
      const parsed = fiscalResidenceSchema.safeParse(context);
      if (parsed.success) {
        const profile = deriveFiscalProfile(parsed.data);
        await prisma.fiscalResidenceProfile.upsert({
          where: { userId_taxYear: { userId, taxYear } },
          create: {
            userId,
            taxYear,
            data: parsed.data as Prisma.InputJsonValue,
            derivedProfile: profile.profile,
            requiresAdditionalReview: profile.requiresAdditionalReview
          },
          update: {
            data: parsed.data as Prisma.InputJsonValue,
            derivedProfile: profile.profile,
            requiresAdditionalReview: profile.requiresAdditionalReview
          }
        });
        state = "income_capture";
        context = { incomes: [], fiscalResidence: parsed.data };
        requiresReview = profile.requiresAdditionalReview;
      }
    }

    if (name === "submit_income_source") {
      const raw = toolNestedOrFlatArgs(args, "income", (a) => {
        return (
          typeof a.grossAmount === "number" ||
          typeof a.paymentDate === "string" ||
          typeof a.payerName === "string"
        );
      });
      if (!raw) continue;
      const parsedIncome = incomeSourceSchema.safeParse(raw);
      if (!parsedIncome.success) continue;
      await persistIncomeSourceRow(userId, taxYear, parsedIncome.data);
      incomeRowsSaved += 1;
    }

    if (name === "submit_deduction") {
      const raw = toolNestedOrFlatArgs(args, "deduction", (a) => {
        return typeof a.deductionType === "string" || typeof a.amount === "number";
      });
      if (!raw) continue;
      const parsedDeduction = deductionSchema.safeParse(raw);
      if (!parsedDeduction.success) continue;
      const d = parsedDeduction.data;
      const v = validateDeductionForMvp(d);
      if (!v.ok) continue;
      await prisma.deduction.create({
        data: {
          userId,
          taxYear,
          deductionType: d.deductionType,
          relatedIncomeId: d.relatedIncomeId ?? null,
          relatedEventId: d.relatedEventId ?? null,
          relatedAssetId: d.relatedAssetId ?? null,
          amount: d.amount,
          currency: d.currency,
          exchangeRate: d.exchangeRate ?? null,
          amountBrl: d.amountBrl ?? null,
          taxPeriod: d.taxPeriod,
          applicationScope: d.applicationScope,
          isRecurring: d.isRecurring ?? null,
          isEligible: d.isEligible ?? null,
          requiresProof: d.requiresProof ?? null,
          proofDocumentUrl: d.proofDocumentUrl ?? null,
          notes: d.notes ?? null
        }
      });
    }

    if (name === "submit_capital_gain") {
      const raw = toolNestedOrFlatArgs(args, "capitalGain", (a) => {
        return typeof a.assetType === "string" || typeof a.saleDate === "string";
      });
      if (!raw) continue;
      const parsedCg = capitalGainCalculationSchema.safeParse(raw);
      if (!parsedCg.success) continue;
      const cg = parsedCg.data;
      const result = computeCapitalGain(cg, capitalJurisdiction);
      const dataPack = capitalJurisdiction === "US" ? DATA_PACK_US_2026 : DATA_PACK_BR_2026;
      await prisma.capitalGainCalculation.create({
        data: {
          userId,
          taxYear,
          assetType: cg.assetType,
          assetCountry: cg.assetCountry,
          acquisitionDate: new Date(cg.acquisitionDate),
          acquisitionValue: cg.acquisitionValue,
          acquisitionCurrency: cg.acquisitionCurrency,
          saleDate: new Date(cg.saleDate),
          saleValue: cg.saleValue,
          saleCurrency: cg.saleCurrency,
          ownershipPercentageSold: cg.ownershipPercentageSold,
          deductibleExpenses: cg.deductibleExpenses,
          foreignTaxPaid: cg.foreignTaxPaid ?? null,
          proportionalCost: null,
          gainAmount: result.gain,
          taxEstimate: result.taxEstimate,
          ruleVersion: buildRuleVersionStamp(dataPack),
          jurisdiction: capitalJurisdiction,
          dataPackVersion: dataPack,
          requiresAdditionalReview: result.requiresAdditionalReview
        }
      });
    }

    if (name === "mark_complex_case") {
      requiresReview = true;
    }

    if (name === "advance_conversation_state") {
      const next = normalizeForwardAdvance(state as ConversationState, args.nextState);
      if (next) state = next;
    }
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      contextJson: context as Prisma.InputJsonValue,
      state,
      requiresAdditionalReview: requiresReview
    }
  });
  return { incomeRowsSaved };
}

async function templateFiscalResidence(
  sessionId: string,
  session: { userId: string; taxYear: number; contextJson: Prisma.JsonValue | null },
  userContent: string
): Promise<string> {
  const c = { ...getContext(session) };
  const lastAsked = (c._lastAskedKey as string | undefined) ?? FISCAL_FIELD_ORDER[0].key;
  const idx = FISCAL_FIELD_ORDER.findIndex((f) => f.key === lastAsked);
  const currentField = FISCAL_FIELD_ORDER[Math.max(0, idx)]!;
  const key = currentField.key;
  c[key] = coerceValue(key, userContent);
  const nextIdx = FISCAL_FIELD_ORDER.findIndex((f) => f.key === key) + 1;

  if (nextIdx < FISCAL_FIELD_ORDER.length) {
    c._lastAskedKey = FISCAL_FIELD_ORDER[nextIdx]!.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return FISCAL_FIELD_ORDER[nextIdx]!.prompt;
  }

  const parsed = fiscalResidenceSchema.safeParse(c);
  if (!parsed.success) {
    c._lastAskedKey = FISCAL_FIELD_ORDER[0]!.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return `I could not validate all fields (${parsed.error.message}). Let's restart: ${FISCAL_FIELD_ORDER[0]!.prompt}`;
  }

  const profile = deriveFiscalProfile(parsed.data);
  await prisma.fiscalResidenceProfile.upsert({
    where: { userId_taxYear: { userId: session.userId, taxYear: session.taxYear } },
    create: {
      userId: session.userId,
      taxYear: session.taxYear,
      data: parsed.data as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    },
    update: {
      data: parsed.data as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    }
  });

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      state: "income_capture",
      requiresAdditionalReview: profile.requiresAdditionalReview,
      contextJson: { incomes: [], fiscalResidence: parsed.data } as Prisma.InputJsonValue
    }
  });

  return `Thanks, I saved your fiscal profile as **${profile.profile}**. ${profile.requiresAdditionalReview ? "This case may need expert review. " : ""}Next, describe your income sources in chat, one at a time.`;
}

function describeFiscalProfileForRecap(raw: string): string {
  const labels: Record<string, string> = {
    resident_brazil: "Brazil fiscal resident (as modeled)",
    non_resident_brazil: "Not a Brazil fiscal resident (as modeled)",
    resident_usa: "United States fiscal resident (as modeled)",
    dual_residence: "Dual residence — Brazil and United States both in scope",
    undetermined: "Residency profile still undetermined from the answers we have"
  };
  return labels[raw] ?? raw.replace(/_/g, " ");
}

function formatAmountForRecap(n: number, currency: string): string {
  const rounded = Math.round(n * 100) / 100;
  const s = Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${s} ${currency}`;
}

/** Richer than net-only so users see the engine ran when net due is legitimately zero. */
function formatAnnualEstimatesForRecap(estimates: Record<string, unknown>[]): string {
  const jurOrder = (j: string) => (j === "BR" ? 0 : j === "US" ? 1 : 9);
  const sorted = [...estimates].sort(
    (a, b) => jurOrder(String(a.jurisdiction ?? "")) - jurOrder(String(b.jurisdiction ?? ""))
  );
  return sorted
    .map((c) => {
      const jur = String(c.jurisdiction ?? "?");
      const cur = String(c.currency ?? "");
      const gross = Number(c.grossIncome);
      const base = Number(c.taxableBase);
      const gTax = Number(c.grossTax);
      const credit = Number(c.taxCreditApplied ?? 0);
      const net = Number(c.netTaxDue);
      const status = String(c.calculationStatus ?? "");
      let line = `- **${jur}** (${cur}): modeled gross **${formatAmountForRecap(gross, cur)}** · taxable base **${formatAmountForRecap(base, cur)}** · gross tax **${formatAmountForRecap(gTax, cur)}** · credit applied **${formatAmountForRecap(credit, cur)}** · **net due ${formatAmountForRecap(net, cur)}** (${status})`;
      if (net === 0 && gross > 0) {
        if (jur === "US") {
          line +=
            "\n  _Federal ordinary tax is modeled on taxable income after the standard deduction; at this income level the modeled taxable base is **zero**, so net due is **zero** before credits._";
        } else if (jur === "BR") {
          line +=
            "\n  _The modeled annual IRPF-style table has a **0%** band on the first slice of taxable base (about **R$ 28,560** in this pack), so gross tax can be **zero** at modest totals._";
        }
      }
      return line;
    })
    .join("\n");
}

async function formatIntakeRecapForChat(userId: string, taxYear: number, reportId: string): Promise<string> {
  const incomes = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    orderBy: [{ paymentDate: "desc" }],
    select: {
      payerName: true,
      incomeType: true,
      grossAmount: true,
      originalCurrency: true,
      paymentDate: true,
      grossAmountBrl: true
    }
  });
  const [ec, dc, cg, mc, fp, reportRow] = await Promise.all([
    prisma.taxableEvent.count({ where: { userId, taxYear } }),
    prisma.deduction.count({ where: { userId, taxYear } }),
    prisma.capitalGainCalculation.count({ where: { userId, taxYear } }),
    prisma.monthlyTaxCalculation.count({ where: { userId, taxYear } }),
    prisma.fiscalResidenceProfile.findUnique({ where: { userId_taxYear: { userId, taxYear } } }),
    prisma.taxReport.findUnique({ where: { id: reportId } })
  ]);
  const ic = incomes.length;
  const profileRaw = fp?.derivedProfile ?? "undetermined";
  const profileLine = describeFiscalProfileForRecap(profileRaw);
  const needsReview =
    (fp?.requiresAdditionalReview ?? false) || (reportRow?.requiresAdditionalReview ?? false);
  const reviewNote = needsReview
    ? "\n\n**Review flag:** this year is marked for **additional expert review** before relying on any numbers."
    : "";

  const reportTitle = reportRow?.title ?? `Tax report ${taxYear}`;
  const stamp = reportRow?.ruleVersion ? `\n- **Rules / data stamp on file:** \`${reportRow.ruleVersion}\`` : "";

  const incomeLines = incomes.slice(0, 6).map((r) => {
    const amt = formatAmountForRecap(r.grossAmount.toNumber(), r.originalCurrency);
    const d = r.paymentDate.toISOString().slice(0, 10);
    return `- **${r.payerName}** · ${r.incomeType} · **${amt}** · paid ${d}`;
  });
  const incomeMore = ic > 6 ? `\n- _…and ${ic - 6} more income line(s)._` : "";

  const withBrl = incomes.filter((r) => r.grossAmountBrl != null);
  let brlBlock = "";
  if (withBrl.length > 0) {
    const sumBrl = withBrl.reduce((s, r) => s + (r.grossAmountBrl?.toNumber() ?? 0), 0);
    brlBlock = `\n**BRL roll-up (where we stored BRL on each line):** about **${formatAmountForRecap(sumBrl, "BRL")}** across **${withBrl.length}** of **${ic}** income lines. This is still not a final IRPF result.\n`;
  } else if (ic > 0) {
    brlBlock =
      "\n_No BRL equivalents were stored on the income rows yet, so no BRL total is shown here._\n";
  }

  const incomeBlock =
    ic > 0
      ? `\n**Income lines (up to six, newest first)**\n${incomeLines.join("\n")}${incomeMore}${brlBlock}\n`
      : "\n_No income rows are on file for this year yet._\n\n";

  const annualEstimates = await getLatestTaxCalculationSnapshot(userId, taxYear);
  let annualEstimatesBlock = "";
  if (annualEstimates.length > 0) {
    annualEstimatesBlock =
      "\n**Annual engine estimates (snapshot, per jurisdiction)**\n" +
      formatAnnualEstimatesForRecap(annualEstimates) +
      "\n_Full numeric fields are also under `summaryJson.annualTaxEstimates` in the downloaded report JSON._\n";
  } else {
    annualEstimatesBlock =
      "\n_No annual tax estimate rows are on file for this year yet (the engine may not have produced a snapshot)._\n";
  }

  return (
    `**Yes — a report was generated.** A **TaxReport** database record was created for **${taxYear}** (title: **${reportTitle}**). It stores the JSON bundle the product uses for review (incomes, taxable events, deductions, monthly snapshots, capital-gain inputs, and **per-jurisdiction annual estimates** with gross, taxable base, and tax lines—not only net due).${stamp}\n\n` +
    `**Profile (modeled):** ${profileLine}\n\n` +
    `**What is in that report**\n` +
    `- Income lines: **${ic}**\n` +
    `- Taxable events: **${ec}**\n` +
    `- Deductions: **${dc}**\n` +
    `- Capital gain calculations: **${cg}**\n` +
    `- Monthly tax snapshots on file: **${mc}**\n` +
    incomeBlock +
    annualEstimatesBlock +
    `All of the above is **orientation only**—not a filing position.${reviewNote}\n\n` +
    `If anything is wrong, reply with the payer, date, or amount to correct.`
  );
}

export async function handleUserMessage(sessionId: string, userContent: string): Promise<{
  assistantText: string;
  sessionState: ConversationState;
}> {
  const session = await prisma.conversationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");

  await prisma.conversationMessage.create({
    data: { sessionId, role: "user", content: userContent }
  });

  let assistantText = "";
  const messages = await prisma.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 40
  });

  const history = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content
  }));

  const ctx = getContext(session);
  if (isTrustOrComplianceConcern(userContent)) {
    assistantText = await trustConcernResponseWithTone(
      session.state as ConversationState,
      session.taxYear,
      ctx,
      userContent,
      session.userId
    );
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if (
    (session.state as ConversationState) === "fiscal_residence" &&
    isFiscalProfileConfirmPending(ctx)
  ) {
    const row = await prisma.fiscalResidenceProfile.findUnique({
      where: { userId_taxYear: { userId: session.userId, taxYear: session.taxYear } }
    });
    const use = isConfirmUseStoredFiscalProfile(userContent);
    const replace = isConfirmReplaceFiscalProfile(userContent);

    if (!row?.data) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { contextJson: stripFiscalProfileConfirmFlag(ctx) as Prisma.InputJsonValue }
      });
      assistantText = `We couldn't load a saved fiscal profile for **${session.taxYear}** anymore. Let's start fresh.\n\n${FISCAL_FIELD_ORDER[0]!.prompt}`;
    } else if (use && !replace) {
      const parsed = fiscalResidenceSchema.safeParse(row.data);
      if (!parsed.success) {
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { contextJson: stripFiscalProfileConfirmFlag(ctx) as Prisma.InputJsonValue }
        });
        assistantText = `The saved profile could not be read anymore. Let's re-enter your details.\n\n${FISCAL_FIELD_ORDER[0]!.prompt}`;
      } else {
        const profile = deriveFiscalProfile(parsed.data);
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: {
            state: "income_capture",
            requiresAdditionalReview: profile.requiresAdditionalReview,
            contextJson: { incomes: [], fiscalResidence: parsed.data } as Prisma.InputJsonValue
          }
        });
        assistantText = await postToolCallAssistantText(
          session.userId,
          "fiscal_residence",
          "income_capture",
          session.taxYear,
          {
            fiscalResidence: parsed.data
          }
        );
      }
    } else if (replace && !use) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { contextJson: stripFiscalProfileConfirmFlag(ctx) as Prisma.InputJsonValue }
      });
      assistantText =
        `Understood — we will re-enter your fiscal profile from scratch.\n\n${FISCAL_FIELD_ORDER[0]!.prompt}`;
    } else {
      assistantText = `Please reply **yes** to keep the saved profile and continue, or **no** to replace it and start over.`;
    }

    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  const rewindTarget = parseRewindTargetStep(userContent);
  if (rewindTarget) {
    const curState = session.state as ConversationState;
    if (conversationStateRank(rewindTarget) < conversationStateRank(curState)) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: rewindTarget }
      });
      const stepLabel = rewindTarget.replace(/_/g, " ");
      assistantText =
        `Opening **${stepLabel}** so you can update earlier answers. Your existing rows stay in the database until you change them.\n\n` +
        (await resolveIntakeRedirect(rewindTarget, ctx, session.userId, session.taxYear));
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if ((session.state as ConversationState) === "income_capture" && isIncomeCaptureDoneIntent(userContent)) {
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: "events" }
    });
    assistantText =
      "Got it — we will move on from income.\n\n" + intakeRedirectForState("events", ctx);
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if ((session.state as ConversationState) === "events") {
    const priorAssistant = lastAssistantContent(messages);
    const askedNoneConfirm = lastAssistantAskedEventNoneConfirmation(priorAssistant);
    const skipEvents = isEventsSkipIntent(userContent);
    const affirmNoEvents = isShortAffirmativeAdvance(userContent) && askedNoneConfirm;
    if (skipEvents || affirmNoEvents) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: "deductions" }
      });
      const lead = skipEvents
        ? "Understood — **no taxable events** for this step."
        : "Thanks — recorded as **no taxable events**.";
      assistantText = `${lead}\n\n` + intakeRedirectForState("deductions", ctx);
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if ((session.state as ConversationState) === "deductions") {
    const priorAssistant = lastAssistantContent(messages);
    const askedProceed = lastAssistantAskedProceed(priorAssistant);
    const skipDeductions = isDeductionsSkipIntent(userContent);
    const affirmProceed = isShortAffirmativeAdvance(userContent) && askedProceed;
    if (skipDeductions || affirmProceed) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: "capital_gain" }
      });
      const lead = skipDeductions
        ? "Noted — we will treat **deductions** as none for this pass."
        : "Great — moving on.";
      assistantText = `${lead}\n\n` + intakeRedirectForState("capital_gain", ctx);
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  const summaryYesStates: ConversationState[] = [
    "events",
    "deductions",
    "capital_gain",
    "monthly_calc",
    "report",
    "complete"
  ];
  const stForSummary = session.state as ConversationState;
  const explicitReportCmd =
    isExplicitGenerateReportIntent(userContent) &&
    (stForSummary === "report" || stForSummary === "monthly_calc" || stForSummary === "complete");
  if (summaryYesStates.includes(stForSummary) || explicitReportCmd) {
    const priorForSummary = lastAssistantContent(messages);
    const summaryConversationYes =
      summaryYesStates.includes(stForSummary) &&
      isShortAffirmativeAdvance(userContent) &&
      lastAssistantOfferedSummary(priorForSummary) &&
      (stForSummary !== "events" || assistantAcknowledgesNoTaxableEvents(priorForSummary));

    if (explicitReportCmd || summaryConversationYes) {
      const reportId = await buildAndSaveReport(session.userId, session.taxYear);
      const recap = await formatIntakeRecapForChat(session.userId, session.taxYear, reportId);
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: "complete" }
      });
      assistantText = recap + "\n\n" + intakeRedirectForState("complete", ctx);
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if (isAdvanceIntent(userContent)) {
    const st = session.state as ConversationState;
    if (st === "income_capture") {
      assistantText = await incomeCheckpointMessage(session.userId, session.taxYear);
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
    if (st === "fiscal_residence") {
      assistantText = isFiscalProfileConfirmPending(ctx)
        ? `First, confirm the saved profile: ${fiscalProfileConfirmPromptText()}`
        : "As soon as your fiscal profile is complete, we will move on automatically. If you are stuck, say **help** or repeat the last question.";
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
    assistantText = await resolveIntakeRedirect(st, ctx, session.userId, session.taxYear);
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if (isLikelyOffTopicUserMessage(session.state as ConversationState, ctx, userContent)) {
    assistantText = await offTopicRedirect(
      session.state as ConversationState,
      session.taxYear,
      ctx,
      session.userId
    );
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if (STATES_ALLOWING_CHAT_INCOME_AMENDMENT.has(session.state as ConversationState)) {
    const parsedLines = parsePaymentLines(userContent);
    const monthlyLines =
      parsedLines.length === 0 ? parseMonthlySalaryLines(userContent, session.taxYear) : [];
    const hints = inferIncomeKindFromChat(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );
    const payerName = inferPayerNameFromIncomeChatLine(userContent);
    const savedSummaries: string[] = [];

    const saveOne = async (
      line: { grossAmount: number; originalCurrency: string; paymentDate: string },
      periodicity: "monthly" | "annual" | "one_off" | "recurring",
      notesSuffix: string
    ) => {
      const draft = incomeSourceSchema.safeParse({
        payerName,
        originCountry: defaultOriginCountryForCurrency(line.originalCurrency),
        incomeType: hints.incomeType,
        grossAmount: line.grossAmount,
        originalCurrency: line.originalCurrency,
        paymentDate: line.paymentDate,
        periodicity,
        nature: hints.nature,
        notes: notesSuffix
      });
      if (!draft.success) return;
      await persistIncomeSourceRow(session.userId, session.taxYear, draft.data);
      const periodNote = periodicity === "monthly" ? " (monthly gross)" : "";
      savedSummaries.push(
        `${draft.data.grossAmount} ${draft.data.originalCurrency} on ${draft.data.paymentDate}${periodNote}`
      );
    };

    if (parsedLines.length >= 1) {
      const notesSuffix =
        parsedLines.length > 1
          ? `Parsed ${parsedLines.length} payment lines from one message; confirm payer and classification if needed.`
          : "Parsed from chat message; confirm payer and classification if needed.";
      for (const line of parsedLines) {
        await saveOne(line, "one_off", notesSuffix);
      }
    } else if (monthlyLines.length >= 1) {
      const notesSuffix =
        "Interpreted as **monthly** gross pay; payment date is an anchor for this tax year—adjust in the income form if needed.";
      for (const line of monthlyLines) {
        await saveOne(line, line.periodicity, notesSuffix);
      }
    }

    if (savedSummaries.length > 0) {
      assistantText =
        `I saved **${savedSummaries.length}** income line(s):\n` +
        savedSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n");
      if ((session.state as ConversationState) === "income_capture") {
        assistantText += `\n\n${await incomeCheckpointMessage(session.userId, session.taxYear)}`;
      } else {
        assistantText +=
          "\n\nPlease confirm employer or payer names if needed, or describe another income type.";
        if ((session.state as ConversationState) === "complete") {
          assistantText +=
            "\n\nTo refresh your **TaxReport** download and tax estimates, say **regenerate the report** (or **generate a new summary**).";
        }
      }
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if (config.llmEnabled) {
    const prevState = session.state as ConversationState;
    const systemPrompt = buildSystemPrompt(
      session.state as ConversationState,
      session.taxYear,
      getContext(session)
    );
    const { content, toolCalls } = await runAssistantWithTools({
      systemPrompt,
      userMessages: history
    });
    const toolResult =
      toolCalls.length > 0
        ? await applyToolCalls(session.userId, session.taxYear, sessionId, toolCalls, session)
        : { incomeRowsSaved: 0 };
    const hadIncomeTool = toolCalls.some(
      (c) => c.type === "function" && c.function.name === "submit_income_source"
    );
    const refreshed = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    const newState = refreshed.state as ConversationState;
    const newCtx = getContext(refreshed);
    const trimmed = content?.trim() ?? "";
    if (trimmed) {
      assistantText = trimmed;
      if (newState === "income_capture") {
        assistantText += `\n\n${await incomeCheckpointMessage(session.userId, session.taxYear)}`;
      }
    } else if (toolCalls.length) {
      if (
        prevState === "income_capture" &&
        hadIncomeTool &&
        toolResult.incomeRowsSaved === 0
      ) {
        assistantText =
          `I could not save an income row from that message. Include **gross amount**, **3-letter currency**, **payment date (YYYY-MM-DD)**, **periodicity** (monthly / one_off / annual / recurring), payer, country, and income type—or use a short line like \`10900 USD 2026-01-31\` or \`10900 USD per month\`.\n\n` +
          (await incomeCheckpointMessage(session.userId, session.taxYear));
      } else {
        assistantText = await postToolCallAssistantText(
          session.userId,
          prevState,
          newState,
          session.taxYear,
          newCtx
        );
      }
    } else if (newState === "income_capture") {
      assistantText = await incomeCheckpointMessage(session.userId, session.taxYear);
    } else {
      assistantText = intakeRedirectForState(newState, newCtx);
    }
  } else if (session.state === "fiscal_residence") {
    assistantText = await templateFiscalResidence(sessionId, session, userContent);
  } else {
    assistantText = `Current step: **${session.state}**. Guided chat is not available in this environment (the assistant needs to be enabled on the server). Please try again later or contact support.`;
  }

  const prePersistSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
  const healedState = healStateIfAssistantAnnouncedLaterStep(
    assistantText,
    prePersistSession.state as ConversationState
  );
  if (healedState) {
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: healedState }
    });
  }

  await prisma.conversationMessage.create({
    data: { sessionId, role: "assistant", content: assistantText }
  });

  const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
  return { assistantText, sessionState: finalSession.state as ConversationState };
}

/** RF-003 sync: rebuild TaxableEvent rows from incomes. */
export async function syncTaxableEvents(userId: string, taxYear: number): Promise<number> {
  const incomes = await prisma.incomeSource.findMany({ where: { userId, taxYear } });
  const parsed = incomes.map((row) =>
    incomeSourceSchema.parse({
      payerName: row.payerName,
      originCountry: row.originCountry,
      incomeType: row.incomeType,
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      periodicity: row.periodicity,
      taxPaidOriginCountry: row.taxPaidOriginCountry?.toNumber(),
      withholdingTax: row.withholdingTax?.toNumber(),
      hasProofDocument: row.hasProofDocument ?? undefined,
      destinationAccountHint: row.destinationAccountHint ?? undefined,
      transferredToBrazil: row.transferredToBrazil ?? undefined,
      remainedAbroad: row.remainedAbroad ?? undefined,
      nature: row.nature,
      notes: row.notes ?? undefined,
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      classification: row.classification as Record<string, unknown> | undefined
    })
  );
  const detected = detectTaxableEventsFromIncomes(parsed);
  await prisma.taxableEvent.deleteMany({ where: { userId, taxYear } });
  for (let i = 0; i < detected.length; i++) {
    const e = detected[i]!;
    await prisma.taxableEvent.create({
      data: {
        userId,
        taxYear,
        eventType: e.eventType,
        description: e.description,
        occurredOn: new Date(parsed[i]!.paymentDate),
        isTaxable: e.isTaxable,
        requiresReview: e.requiresReview,
        incomeSourceId: incomes[i]?.id,
        amountBrl: parsed[i]!.grossAmountBrl ?? undefined,
        currency: parsed[i]!.originalCurrency,
        amountOriginal: parsed[i]!.grossAmount
      }
    });
  }
  return detected.length;
}

async function loadRulePatches(jurisdiction: "BR" | "US", taxYear: number): Promise<{ key: string; value: unknown }[]> {
  const rows = await prisma.ruleOverride.findMany({
    where: { jurisdiction, taxYear }
  });
  return rows.map((r) => ({ key: r.key, value: r.valueJson as unknown }));
}

export async function recomputeMonthlyTax(userId: string, taxYear: number): Promise<void> {
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = fp?.derivedProfile ?? "undetermined";
  if (profile === "resident_usa") {
    return;
  }

  const brPack = getBrRulePack(await loadRulePatches("BR", taxYear));
  const ruleStamp = buildRuleVersionStamp(brPack.dataPackId);

  const incomes = await prisma.incomeSource.findMany({ where: { userId, taxYear } });
  const items = [];
  for (const row of incomes) {
    const cls = row.classification as { calculationModule?: string } | null;
    if (cls?.calculationModule !== "carnet_leao") continue;
    const fx = resolveBrlFromIncome({
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
    });
    const requiresReview = (fp?.requiresAdditionalReview ?? false) || fx.requiresAdditionalReview;
    items.push({
      incomeSourceId: row.id,
      taxEventId: undefined,
      incomeType: row.incomeType,
      originCountry: row.originCountry,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      originalAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      exchangeRate: fx.exchangeRate,
      amountBrl: fx.amountBrl,
      foreignTaxPaid: row.taxPaidOriginCountry?.toNumber(),
      deductionAmount: 0,
      exemptionAmount: 0,
      taxableAmount: fx.amountBrl,
      calculatedTax: 0,
      requiresReview,
      notes: fx.notes
    });
  }
  const taxedItems = applyCarneLeaoTaxToItems(items, brPack);
  const aggregates = aggregateMonthlyCarnetLeao(taxedItems, { ruleVersion: ruleStamp });
  for (const agg of aggregates) {
    const parent = await prisma.monthlyTaxCalculation.upsert({
      where: {
        userId_taxYear_taxMonth: { userId, taxYear, taxMonth: agg.month }
      },
      create: {
        userId,
        taxYear,
        taxMonth: agg.month,
        fiscalResidenceStatus: fp?.derivedProfile ?? null,
        totalForeignIncomeBrl: agg.taxableBaseBrl,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.grossTax,
        calculationStatus: agg.requiresAdditionalReview ? "preliminary" : "complete",
        requiresAdditionalReview: agg.requiresAdditionalReview,
        ruleVersion: agg.ruleVersion,
        jurisdiction: "BR",
        dataPackVersion: brPack.dataPackId
      },
      update: {
        totalForeignIncomeBrl: agg.taxableBaseBrl,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.grossTax,
        calculationStatus: agg.requiresAdditionalReview ? "preliminary" : "complete",
        requiresAdditionalReview: agg.requiresAdditionalReview,
        ruleVersion: agg.ruleVersion,
        jurisdiction: "BR",
        dataPackVersion: brPack.dataPackId
      }
    });
    await prisma.monthlyTaxCalculationItem.deleteMany({
      where: { monthlyTaxCalculationId: parent.id }
    });
    for (const it of agg.items) {
      await prisma.monthlyTaxCalculationItem.create({
        data: {
          monthlyTaxCalculationId: parent.id,
          incomeSourceId: it.incomeSourceId ?? null,
          incomeType: it.incomeType,
          originCountry: it.originCountry,
          paymentDate: new Date(it.paymentDate),
          originalAmount: it.originalAmount,
          originalCurrency: it.originalCurrency,
          exchangeRate: it.exchangeRate,
          amountBrl: it.amountBrl,
          foreignTaxPaid: it.foreignTaxPaid ?? null,
          deductionAmount: it.deductionAmount ?? null,
          exemptionAmount: it.exemptionAmount ?? null,
          taxableAmount: it.taxableAmount,
          calculatedTax: it.calculatedTax,
          requiresReview: it.requiresReview ?? false,
          notes: it.notes ?? null
        }
      });
    }
  }
}

function serializeTaxCalculationRow(r: TaxCalculation): Record<string, unknown> {
  return {
    id: r.id,
    jurisdiction: r.jurisdiction,
    calculationType: r.calculationType,
    currency: r.currency,
    grossIncome: r.grossIncome.toNumber(),
    deductionsTotal: r.deductionsTotal.toNumber(),
    exemptionsTotal: r.exemptionsTotal.toNumber(),
    taxableBase: r.taxableBase.toNumber(),
    appliedRate: r.appliedRate.toNumber(),
    grossTax: r.grossTax.toNumber(),
    foreignTaxPaid: r.foreignTaxPaid?.toNumber() ?? null,
    taxCreditApplied: r.taxCreditApplied?.toNumber() ?? null,
    netTaxDue: r.netTaxDue.toNumber(),
    calculationStatus: r.calculationStatus,
    requiresAdditionalReview: r.requiresAdditionalReview,
    ruleVersion: r.ruleVersion,
    dataPackVersion: r.dataPackVersion ?? null,
    feieApplied: r.feieApplied?.toNumber() ?? null,
    ftcApplied: r.ftcApplied?.toNumber() ?? null,
    niit: r.niit?.toNumber() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

/** One row per jurisdiction: the newest TaxCalculation for that user/year/jurisdiction. */
async function getLatestTaxCalculationSnapshot(
  userId: string,
  taxYear: number
): Promise<Record<string, unknown>[]> {
  const rows = await prisma.taxCalculation.findMany({
    where: { userId, taxYear },
    orderBy: { createdAt: "desc" }
  });
  const byJurisdiction = new Map<string, TaxCalculation>();
  for (const row of rows) {
    if (!byJurisdiction.has(row.jurisdiction)) byJurisdiction.set(row.jurisdiction, row);
  }
  return [...byJurisdiction.values()].map(serializeTaxCalculationRow);
}

export async function buildAndSaveReport(userId: string, taxYear: number): Promise<string> {
  await recomputeMonthlyTax(userId, taxYear);
  await estimateAnnualTax(userId, taxYear);

  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const incomes = await prisma.incomeSource.findMany({ where: { userId, taxYear } });
  const events = await prisma.taxableEvent.findMany({ where: { userId, taxYear } });
  const deductions = await prisma.deduction.findMany({ where: { userId, taxYear } });
  const monthly = await prisma.monthlyTaxCalculation.findMany({ where: { userId, taxYear } });
  const capitalGains = await prisma.capitalGainCalculation.findMany({ where: { userId, taxYear } });
  const requiresAdditionalReview =
    (fp?.requiresAdditionalReview ?? false) ||
    events.some((e) => e.requiresReview) ||
    monthly.some((m) => m.requiresAdditionalReview);

  const prof = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurs = jurisdictionsForProfile(prof);
  const reportRuleVersion =
    jurs.includes("BR") && jurs.includes("US")
      ? `${buildRuleVersionStamp(DATA_PACK_BR_2026)}+${buildRuleVersionStamp(DATA_PACK_US_2026)}`
      : jurs.includes("US")
        ? buildRuleVersionStamp(DATA_PACK_US_2026)
        : buildRuleVersionStamp(DATA_PACK_BR_2026);
  const reportJurisdiction = jurs.includes("BR") && jurs.includes("US") ? "BR+US" : jurs.includes("US") ? "US" : "BR";

  const annualTaxEstimates = await getLatestTaxCalculationSnapshot(userId, taxYear);

  const summary = buildTaxReportSummary({
    taxYear,
    fiscalProfile: fp?.derivedProfile ?? "unknown",
    incomes,
    events,
    deductions,
    monthly,
    capitalGains,
    annualTaxEstimates,
    requiresAdditionalReview,
    ruleVersion: reportRuleVersion
  });

  const report = await prisma.taxReport.create({
    data: {
      userId,
      taxYear,
      title: summary.title,
      summaryJson: summary.summaryJson as Prisma.InputJsonValue,
      requiresAdditionalReview: summary.requiresAdditionalReview,
      ruleVersion: summary.ruleVersion,
      jurisdiction: reportJurisdiction,
      dataPackVersion: reportRuleVersion
    }
  });
  return report.id;
}

export async function estimateAnnualTax(userId: string, taxYear: number): Promise<void> {
  const incomes = await prisma.incomeSource.findMany({ where: { userId, taxYear } });
  const deductions = await prisma.deduction.findMany({ where: { userId, taxYear } });
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurs = jurisdictionsForProfile(profile);
  const brPack = getBrRulePack(await loadRulePatches("BR", taxYear));
  const usPack = getUsRulePack(await loadRulePatches("US", taxYear));

  for (const jurisdiction of jurs) {
    if (jurisdiction === "BR") {
      let grossBrl = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const fx = resolveBrlFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency,
          grossAmountBrl: row.grossAmountBrl?.toNumber(),
          exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
        });
        grossBrl += fx.amountBrl;
        review ||= fx.requiresAdditionalReview;
      }
      const dedBrl = deductions.reduce((s, d) => s + (d.amountBrl?.toNumber() ?? d.amount.toNumber()), 0);
      const foreignBrl = incomes.reduce((s, i) => s + (i.taxPaidOriginCountry?.toNumber() ?? 0), 0);
      const est = buildBrAnnualEstimate({
        taxYear,
        grossIncomeBrl: grossBrl,
        deductionsTotalBrl: dedBrl,
        exemptionsTotalBrl: 0,
        foreignTaxPaidBrl: foreignBrl,
        requiresAdditionalReview: review,
        pack: brPack
      });
      await prisma.taxCalculation.create({
        data: {
          userId,
          taxYear: est.taxYear,
          calculationType: est.calculationType,
          grossIncome: est.grossIncome,
          deductionsTotal: est.deductionsTotal,
          exemptionsTotal: est.exemptionsTotal,
          taxableBase: est.taxableBase,
          appliedRate: est.appliedRate,
          grossTax: est.grossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: est.netTaxDue,
          currency: est.currency,
          calculationStatus: est.calculationStatus,
          requiresAdditionalReview: est.requiresAdditionalReview,
          ruleVersion: est.ruleVersion,
          jurisdiction: "BR",
          dataPackVersion: est.dataPackVersion ?? brPack.dataPackId,
          feieApplied: null,
          ftcApplied: null,
          niit: null
        }
      });
    } else {
      let grossUsd = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const fx = resolveUsdFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency
        });
        grossUsd += fx.amountUsd;
        review ||= fx.requiresAdditionalReview;
      }
      let dedUsd = 0;
      for (const d of deductions) {
        if (d.currency === "USD") {
          dedUsd += d.amount.toNumber();
        } else if (d.currency === "BRL" && d.amountBrl) {
          review = true;
        } else {
          review = true;
        }
      }
      const foreignUsd = incomes.reduce((s, i) => s + (i.taxPaidOriginCountry?.toNumber() ?? 0), 0);
      const est = buildUsAnnualEstimate({
        taxYear,
        grossIncomeUsd: grossUsd,
        deductionsUsd: dedUsd,
        exemptionsUsd: 0,
        foreignTaxPaidUsd: foreignUsd,
        foreignEarnedIncomeUsd: 0,
        netInvestmentIncomeUsd: 0,
        filingStatus: "single",
        requiresAdditionalReview: review,
        pack: usPack
      });
      await prisma.taxCalculation.create({
        data: {
          userId,
          taxYear: est.taxYear,
          calculationType: est.calculationType,
          grossIncome: est.grossIncome,
          deductionsTotal: est.deductionsTotal,
          exemptionsTotal: est.exemptionsTotal,
          taxableBase: est.taxableBase,
          appliedRate: est.appliedRate,
          grossTax: est.grossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: est.netTaxDue,
          currency: est.currency,
          calculationStatus: est.calculationStatus,
          requiresAdditionalReview: est.requiresAdditionalReview,
          ruleVersion: est.ruleVersion,
          jurisdiction: "US",
          dataPackVersion: est.dataPackVersion ?? usPack.dataPackId,
          feieApplied: est.feieApplied ?? null,
          ftcApplied: est.ftcApplied ?? null,
          niit: est.niit ?? null
        }
      });
    }
  }
}
