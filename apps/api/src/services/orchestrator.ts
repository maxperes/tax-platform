import {
  fiscalResidenceSchema,
  incomeSourceSchema,
  deductionSchema,
  capitalGainCalculationSchema,
  type ConversationState
} from "@tax-platform/shared";
import { deriveFiscalProfile } from "@tax-platform/rules";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import type { FiscalResidence } from "@tax-platform/shared";
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
  assistantAcknowledgesNoTaxableEvents,
  isExplicitGenerateReportIntent,
  lastAssistantOfferedSummary
} from "./summary-offer.js";
import { createClassifiedIncome } from "./persistence/income.js";
import { createDeduction } from "./persistence/deduction.js";
import { createCapitalGainCalculation } from "./persistence/capital-gain.js";
import { buildAndSaveReport, getLatestTaxCalculationSnapshot } from "./tax-pipeline.js";
import {
  describeModulePlanForUser,
  eventsCheckpointMessage,
  formatCapitalGainsBlockForRecap,
  formatMissingDataChecklist,
  formatMonthlySummaryBlockForRecap,
  formatMonthlyTaxForRecap,
  applyProfileAwareAdvance,
  isCapitalGainSkipIntent,
  isEventsConfirmIntent,
  isMonthlyCalcConfirmIntent,
  isProceedAnywayIntent,
  isTriagePending,
  isUsFilingPending,
  loadIntakeModulePlan,
  nextActionsBlock,
  nextStateAfterCapitalGain,
  nextStateAfterDeductions,
  nextStateAfterEvents,
  parseIntakeGoal,
  parseUsFilingInputs,
  resolveIncomeGaps,
  specialistHandoffBlock,
  triagePromptText,
  usFilingPromptText,
  type IntakeModulePlan
} from "./intake-helpers.js";
import {
  coerceFiscalBooleansInPlace,
  coerceFiscalFieldValue,
  firstFiscalFieldPrompt,
  getActiveFiscalFieldOrder,
  getFiscalQuestionForContext,
  isValidFiscalFieldValue,
  looksLikeFiscalFieldAnswer,
  prepareFiscalPayloadForValidation
} from "./fiscal-intake.js";

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

function getContext(session: { contextJson: Prisma.JsonValue | null }): Record<string, unknown> {
  return (session.contextJson as Record<string, unknown>) ?? {};
}

function parseBool(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "true", "1", "sim"].includes(t)) return true;
  if (["no", "n", "false", "0", "nao", "não"].includes(t)) return false;
  return undefined;
}

/**
 * When the LLM omits the user's answer in submit_fiscal_residence, merge the raw message
 * into the first missing fiscal field if it matches that field's shape.
 */
function fuseUserMessageIntoFiscalContext(
  context: Record<string, unknown>,
  userContent: string
): Record<string, unknown> | null {
  if (isFiscalProfileConfirmPending(context)) return null;
  const t = userContent.trim();
  if (!t) return null;
  const merged = getFiscalResidenceMergedFields(context);
  const expectedKey = getActiveFiscalFieldOrder(merged).find((f) => !isValidFiscalFieldValue(f.key, merged[f.key]))
    ?.key;
  if (!expectedKey) return null;
  if (!looksLikeFiscalFieldAnswer(expectedKey, t)) return null;
  const next = { ...context, [expectedKey]: coerceFiscalFieldValue(expectedKey, t) };
  coerceFiscalBooleansInPlace(next);
  return next;
}

type FiscalCompleteResult = {
  context: Record<string, unknown>;
  state: ConversationState;
  requiresAdditionalReview: boolean;
};

async function completeFiscalProfileAndDetermineNext(
  userId: string,
  taxYear: number,
  parsed: FiscalResidence,
  existingCtx: Record<string, unknown>
): Promise<FiscalCompleteResult> {
  const profile = deriveFiscalProfile(parsed);
  await prisma.fiscalResidenceProfile.upsert({
    where: { userId_taxYear: { userId, taxYear } },
    create: {
      userId,
      taxYear,
      data: parsed as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    },
    update: {
      data: parsed as Prisma.InputJsonValue,
      derivedProfile: profile.profile,
      requiresAdditionalReview: profile.requiresAdditionalReview
    }
  });
  const ctx: Record<string, unknown> = {
    ...existingCtx,
    incomes: [],
    fiscalResidence: parsed,
    intakeGoal: existingCtx.intakeGoal
  };
  delete ctx._lastAskedKey;
  const needsUs = profile.profile === "resident_usa" || profile.profile === "dual_residence";
  if (needsUs && !ctx.usFilingInputs) {
    ctx._usFilingPending = true;
    return { context: ctx, state: "fiscal_residence", requiresAdditionalReview: profile.requiresAdditionalReview };
  }
  delete ctx._usFilingPending;
  return { context: ctx, state: "income_capture", requiresAdditionalReview: profile.requiresAdditionalReview };
}

async function tryCompleteFiscalResidenceFromContext(
  userId: string,
  taxYear: number,
  ctx: Record<string, unknown>
): Promise<FiscalCompleteResult | null> {
  const merged = prepareFiscalPayloadForValidation(getFiscalResidenceMergedFields(ctx));
  for (const { key } of getActiveFiscalFieldOrder(merged)) {
    if (!isValidFiscalFieldValue(key, merged[key])) return null;
  }
  const parsed = fiscalResidenceSchema.safeParse(merged);
  if (!parsed.success) return null;
  return completeFiscalProfileAndDetermineNext(userId, taxYear, parsed.data, ctx);
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
  const rest = { ...data };
  delete rest.fiscalResidence;
  let flat: Record<string, unknown> = rest;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    flat = { ...(nested as Record<string, unknown>), ...flat };
  }
  return normalizeFiscalAliasKeys(flat);
}

export function initialAssistantMessage(taxYear: number): string {
  return (
    `Hi, I will guide you step by step for your **${taxYear}** tax intake. We will ask what applies to you first, then tax-related questions, and contact details at the end.\n\n` +
    triagePromptText()
  );
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
  context: Record<string, unknown>,
  modulePlan?: IntakeModulePlan
): string {
  const planBlock = modulePlan
    ? `\nModule plan: ${JSON.stringify({
        profile: modulePlan.derivedProfile,
        skipMonthly: modulePlan.skipMonthly,
        needsCarnetLeao: modulePlan.needsCarnetLeao,
        intakeGoal: modulePlan.intakeGoal
      })}`
    : "";
  const incomeCaptureBlock =
    state === "income_capture"
      ? `
Income capture (critical):
- Each distinct payment must be one database row: one gross amount, one currency, one payment date, periodicity (monthly | annual | one_off | recurring), payerName, originCountry (ISO), incomeType, and nature (work | investment | retirement | asset | corporate | trust | other).
- **submit_income_source** must pass the full **income** object matching the schema. If any required field is wrong or omitted, the row is **not** saved—double-check **paymentDate** is **YYYY-MM-DD** and **originalCurrency** is 3 letters.
- Monthly pay: set **periodicity** to **monthly**, **grossAmount** to the monthly gross, **paymentDate** to a representative pay date in ${taxYear} (e.g. last day of a month).
- If the user lists several payments in one message (e.g. multiple "amount CURRENCY YYYY-MM-DD" lines), call submit_income_source once per payment — never merge multiple dates/amounts into a single tool call.
- Short lines like **10900 USD per month** may be saved by the server without your tool call; still call **submit_income_source** when you have a complete structured row.
- Infer missing payer or country only when clearly implied; otherwise ask one short follow-up after saving.
- For foreign-currency income under Carnê-Leão, ask for **exchangeRateToBrl** or **grossAmountBrl** before advancing.
- Ask whether tax was **withheld abroad** (taxPaidOriginCountry) when foreign salary or dividends are involved.`
      : "";

  const eventsBlock =
    state === "events"
      ? `
Events step: taxable events are **auto-derived from income** — do NOT ask the user to list vesting/sales from scratch. Confirm the derived table; call advance_conversation_state to "capital_gain" when they confirm (or "deductions" if capital gains do not apply to their intake goal).`
      : "";

  const monthlyBlock =
    state === "monthly_calc"
      ? `
Monthly step: Carnê-Leão totals are pre-computed — help the user review the month table. Advance to "report" when they confirm.`
      : "";

  return `You are a warm, concise tax intake assistant for year ${taxYear}. Current workflow step: ${state}.
${planBlock}
${incomeCaptureBlock}
${eventsBlock}
${monthlyBlock}

Hard scope rules:
- ONLY help the user complete this intake workflow (collecting structured answers, clarifying unclear answers, and explaining what the NEXT question is asking).
- You MAY answer short trust/compliance questions related to this service (privacy, data storage/retention, security, access control, deletion/export requests) and then return to intake.
- Do NOT answer unrelated questions (general knowledge, news, coding, entertainment, personal advice, politics, sports, recipes, etc.). If the user asks something unrelated, refuse briefly and return to the current intake task.
- Do NOT compute or guarantee final tax outcomes; never present numbers as definitive filing results.
- In fiscal_residence, prioritize tax-relevant fields first and leave name/email for the final part of that step.
- In fiscal_residence, do NOT ask for a full postal address, street, apartment, or similar. Only ask for fields that exist in the fiscal residence schema (e.g. ISO country codes, birth date, yes/no residency questions, conditional tie-breakers for complex cases, then name and email at the end). Reporting currency is inferred from residence — do not ask for primaryCurrency. If the user offers an address, thank them and say we will capture address details later if needed — continue with the next schema question.
- In fiscal_residence, after fiscal data is complete, US residents may be asked filing status (single/mfj/hoh) before income — not during income_capture.
- In fiscal_residence, after **each** user message you MUST call **submit_fiscal_residence** with \`data\` containing **every** fiscal field gathered so far (copy from Context so far, then add or update the latest answer). Sending only the last field drops prior answers from the session.

Never compute final taxes yourself. Use function tools to save structured data.
- When the user says next step, continue, or similar, call the advance_conversation_state tool if the current step is complete; otherwise briefly say what is still missing.
- Whenever you move the user to a different workflow step, you MUST call advance_conversation_state with the correct nextState in the same turn. Do not only describe the new step in text — the UI reads the tool-updated step.
- advance_conversation_state must never request a step earlier in the flow than the current one (e.g. do not go from capital_gain back to events).
- In income_capture, if the user clearly signals they are finished listing incomes (e.g. "that's all", "no more income", "I'm done"), call advance_conversation_state with nextState "events" without insisting on another income row.
- In events, the user confirms **derived** taxable events (e.g. "looks correct", "yes") — call advance_conversation_state with nextState "capital_gain" (or "deductions" when capital gains are skipped for their intake goal).
- In capital_gain, if the user had no asset sales (e.g. "no capital gains", "none"), call advance_conversation_state with nextState "deductions".
- In deductions, if the user has no deductions (e.g. "no deductions", "none"), call advance_conversation_state to the next applicable step (monthly_calc or report if monthly is skipped).
- In monthly_calc, when the user confirms monthly totals, call advance_conversation_state with nextState "report".
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

function getFiscalResidenceCurrentQuestion(context: Record<string, unknown>): string {
  if (isFiscalProfileConfirmPending(context)) {
    return fiscalProfileConfirmPromptText();
  }
  if (isTriagePending(context)) {
    return triagePromptText();
  }
  if (context._usFilingPending === true) {
    return usFilingPromptText();
  }
  return getFiscalQuestionForContext(getFiscalResidenceMergedFields(context));
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
    if (isTriagePending(context)) {
      if (parseIntakeGoal(t)) return false;
      return true;
    }
    if (isFiscalProfileConfirmPending(context)) {
      if (isConfirmUseStoredFiscalProfile(t) || isConfirmReplaceFiscalProfile(t)) return false;
      return true;
    }
    if (context._usFilingPending === true) {
      if (parseUsFilingInputs(t)) return false;
      return true;
    }
    const merged = getFiscalResidenceMergedFields(context);
    const expectedKey = getActiveFiscalFieldOrder(merged).find((f) => !isValidFiscalFieldValue(f.key, merged[f.key]))
      ?.key;
    if (!expectedKey) return false;
    return !looksLikeFiscalFieldAnswer(expectedKey, t);
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
    "Access is limited to your account and authorized service operations. " +
    "You can export or delete your data anytime from Privacy settings in the app (export my data / delete my account)."
  );
}

function messageAlreadyAsksQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  const lower = text.toLowerCase();
  return (
    /\bplease provide\b/.test(lower) ||
    /\bwhat is your\b/.test(lower) ||
    /\bwhen were you born\b/.test(lower) ||
    /\btell me your\b/.test(lower) ||
    /\bshare your\b/.test(lower)
  );
}

function hadFiscalResidenceToolCall(toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[]): boolean {
  return toolCalls.some(
    (c) => c.type === "function" && c.function.name === "submit_fiscal_residence"
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
    return "Next we **review taxable events derived from your income** — confirm the table or go back to income to fix sources.";
  }
  if (state === "deductions") {
    return "List **deductions** you want to claim (type, amount, currency, tax period), one at a time, or say you have none.";
  }
  if (state === "capital_gain") {
    return "Next, we capture **capital gains** (asset type, acquisition and sale dates/values, currencies). Describe one disposition at a time here in chat.";
  }
  if (state === "monthly_calc") {
    return "We review **monthly Carnê-Leão** totals built from your income timeline. Confirm the month table or say what to fix.";
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
  if (prevState === "fiscal_residence" && (newState === "income_capture" || newState === "fiscal_residence")) {
    const fr = context.fiscalResidence;
    const parsed =
      fr && typeof fr === "object"
        ? fiscalResidenceSchema.safeParse(fr)
        : ({ success: false } as const);
    const plan = await loadIntakeModulePlan(userId, taxYear, context);
    if (parsed.success) {
      const profile = deriveFiscalProfile(parsed.data);
      const review = profile.requiresAdditionalReview ? " This case may need expert review." : "";
      const name = parsed.data.fullName?.trim();
      const thanks = name ? `Thanks, **${name}**. ` : "";
      const planNote = describeModulePlanForUser(plan);
      const tail =
        context._usFilingPending === true
          ? usFilingPromptText()
          : await resolveIntakeRedirect("income_capture", context, userId, taxYear);
      return `${thanks}Your fiscal profile for **${taxYear}** is saved as **${profile.profile}**.${review}\n\n${planNote}\n\n${tail}`;
    }
    return `Your progress on the fiscal profile for **${taxYear}** is saved.\n\n${await resolveIntakeRedirect(newState, context, userId, taxYear)}`;
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
    return (
      `**Income screening:** any income from **Brazil**, the **US**, or **other countries** this year? Add each source with amount, currency, and date.\n\n${cta}\n\n_Income on file: **0** rows._`
    );
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
    const plan = await loadIntakeModulePlan(userId, taxYear, context);
    const gaps = await resolveIncomeGaps(userId, taxYear);
    const base = await incomeCheckpointMessage(userId, taxYear);
    const planNote = describeModulePlanForUser(plan);
    if (gaps.summaryText) {
      return `${planNote}\n\n${gaps.summaryText}\n\n${base}`;
    }
    return `${planNote}\n\n${base}`;
  }
  if (state === "events") {
    return eventsCheckpointMessage(userId, taxYear);
  }
  if (state === "monthly_calc") {
    return formatMonthlyTaxForRecap(userId, taxYear);
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
      const merged = prepareFiscalPayloadForValidation(getFiscalResidenceMergedFields(context));
      const parsed = fiscalResidenceSchema.safeParse(merged);
      if (parsed.success) {
        const result = await completeFiscalProfileAndDetermineNext(userId, taxYear, parsed.data, context);
        state = result.state;
        context = result.context;
        requiresReview = result.requiresAdditionalReview;
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
      await createClassifiedIncome(userId, taxYear, parsedIncome.data);
      incomeRowsSaved += 1;
    }

    if (name === "submit_deduction") {
      const raw = toolNestedOrFlatArgs(args, "deduction", (a) => {
        return typeof a.deductionType === "string" || typeof a.amount === "number";
      });
      if (!raw) continue;
      const parsedDeduction = deductionSchema.safeParse(raw);
      if (!parsedDeduction.success) continue;
      const created = await createDeduction(userId, taxYear, parsedDeduction.data);
      if (!created.ok) continue;
    }

    if (name === "submit_capital_gain") {
      const raw = toolNestedOrFlatArgs(args, "capitalGain", (a) => {
        return typeof a.assetType === "string" || typeof a.saleDate === "string";
      });
      if (!raw) continue;
      const parsedCg = capitalGainCalculationSchema.safeParse(raw);
      if (!parsedCg.success) continue;
      await createCapitalGainCalculation(userId, taxYear, parsedCg.data);
    }

    if (name === "mark_complex_case") {
      requiresReview = true;
    }

    if (name === "advance_conversation_state") {
      const rawNext = normalizeForwardAdvance(state as ConversationState, args.nextState);
      if (rawNext) {
        const plan = await loadIntakeModulePlan(userId, taxYear, context);
        state = applyProfileAwareAdvance(state as ConversationState, rawNext, plan);
      }
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
  const mergedBefore = getFiscalResidenceMergedFields(c);
  const order = getActiveFiscalFieldOrder(mergedBefore);
  const lastAsked = (c._lastAskedKey as string | undefined) ?? order[0]!.key;
  const currentField = order.find((f) => f.key === lastAsked) ?? order[0]!;
  c[currentField.key] = coerceFiscalFieldValue(currentField.key, userContent);
  coerceFiscalBooleansInPlace(c);

  const merged = getFiscalResidenceMergedFields(c);
  const nextField = getActiveFiscalFieldOrder(merged).find((f) => !isValidFiscalFieldValue(f.key, merged[f.key]));
  if (nextField) {
    c._lastAskedKey = nextField.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return nextField.prompt;
  }

  const forValidation = prepareFiscalPayloadForValidation(merged);
  const parsed = fiscalResidenceSchema.safeParse(forValidation);
  if (!parsed.success) {
    c._lastAskedKey = order[0]!.key;
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { contextJson: c as Prisma.InputJsonValue }
    });
    return `I could not validate all fields (${parsed.error.message}). Let's restart: ${firstFiscalFieldPrompt()}`;
  }

  const result = await completeFiscalProfileAndDetermineNext(session.userId, session.taxYear, parsed.data, c);
  const plan = await loadIntakeModulePlan(session.userId, session.taxYear, result.context);
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      state: result.state,
      requiresAdditionalReview: result.requiresAdditionalReview,
      contextJson: result.context as Prisma.InputJsonValue
    }
  });

  const profile = deriveFiscalProfile(parsed.data);
  let tail = "";
  if (result.state === "fiscal_residence" && result.context._usFilingPending === true) {
    tail = usFilingPromptText();
  } else {
    tail = await resolveIntakeRedirect("income_capture", result.context, session.userId, session.taxYear);
  }
  return (
    `Thanks, I saved your fiscal profile as **${profile.profile}**. ${profile.requiresAdditionalReview ? "This case may need expert review. " : ""}` +
    `${describeModulePlanForUser(plan)}\n\n${tail}`
  );
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

  const monthlyBlock = await formatMonthlySummaryBlockForRecap(userId, taxYear);
  const capitalBlock = await formatCapitalGainsBlockForRecap(userId, taxYear);
  const checklist = await formatMissingDataChecklist(userId, taxYear);
  const actions = nextActionsBlock();

  return (
    `**Yes — a report was generated.** A **TaxReport** database record was created for **${taxYear}** (title: **${reportTitle}**). It stores the JSON bundle the product uses for review (incomes, taxable events, deductions, monthly snapshots, capital-gain inputs, and **per-jurisdiction annual estimates** with gross, taxable base, and tax lines—not only net due).${stamp}\n\n` +
    `**Profile (modeled):** ${profileLine}\n\n` +
    `**What is in that report**\n` +
    `- Income lines: **${ic}**\n` +
    `- Taxable events (derived): **${ec}**\n` +
    `- Deductions: **${dc}**\n` +
    `- Capital gain calculations: **${cg}**\n` +
    `- Monthly tax snapshots on file: **${mc}**\n` +
    incomeBlock +
    monthlyBlock +
    capitalBlock +
    annualEstimatesBlock +
    checklist +
    `All of the above is **orientation only**—not a filing position.${reviewNote}\n\n` +
    actions +
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

  if ((session.state as ConversationState) === "fiscal_residence" && isTriagePending(ctx)) {
    const goal = parseIntakeGoal(userContent);
    if (goal) {
      const newCtx = { ...ctx, intakeGoal: goal, _triagePending: false };
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { contextJson: newCtx as Prisma.InputJsonValue }
      });
      if (isFiscalProfileConfirmPending(newCtx)) {
        const row = await prisma.fiscalResidenceProfile.findUnique({
          where: { userId_taxYear: { userId: session.userId, taxYear: session.taxYear } }
        });
        const parsed =
          row?.data && typeof row.data === "object"
            ? fiscalResidenceSchema.safeParse(row.data)
            : ({ success: false } as const);
        if (parsed.success) {
          assistantText =
            `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n` +
            buildAssistantMessageForExistingFiscalProfile({
              taxYear: session.taxYear,
              data: parsed.data,
              derivedProfile: row!.derivedProfile,
              requiresAdditionalReview: row!.requiresAdditionalReview
            });
        } else {
          assistantText = `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n${firstFiscalFieldPrompt()}`;
        }
      } else {
        assistantText = `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n${firstFiscalFieldPrompt()}`;
      }
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if (
    (session.state as ConversationState) === "fiscal_residence" &&
    !isTriagePending(ctx) &&
    !isFiscalProfileConfirmPending(ctx)
  ) {
    const plan = await loadIntakeModulePlan(session.userId, session.taxYear, ctx);
    if (isUsFilingPending(ctx, plan)) {
      const usInputs = parseUsFilingInputs(userContent);
      if (usInputs) {
        const newCtx = { ...ctx, usFilingInputs: usInputs, _usFilingPending: false };
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: {
            state: "income_capture",
            contextJson: newCtx as Prisma.InputJsonValue
          }
        });
        assistantText =
          `Saved US filing status: **${usInputs.filingStatus.replace(/_/g, " ")}**.\n\n` +
          (await resolveIntakeRedirect("income_capture", newCtx, session.userId, session.taxYear));
        await prisma.conversationMessage.create({
          data: { sessionId, role: "assistant", content: assistantText }
        });
        const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
        return { assistantText, sessionState: finalSession.state as ConversationState };
      }
    }
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
      assistantText = `We couldn't load a saved fiscal profile for **${session.taxYear}** anymore. Let's start fresh.\n\n${firstFiscalFieldPrompt()}`;
    } else if (use && !replace) {
      const parsed = fiscalResidenceSchema.safeParse(row.data);
      if (!parsed.success) {
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { contextJson: stripFiscalProfileConfirmFlag(ctx) as Prisma.InputJsonValue }
        });
        assistantText = `The saved profile could not be read anymore. Let's re-enter your details.\n\n${firstFiscalFieldPrompt()}`;
      } else {
        const result = await completeFiscalProfileAndDetermineNext(
          session.userId,
          session.taxYear,
          parsed.data,
          { ...ctx, intakeGoal: ctx.intakeGoal }
        );
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: {
            state: result.state,
            requiresAdditionalReview: result.requiresAdditionalReview,
            contextJson: result.context as Prisma.InputJsonValue
          }
        });
        assistantText = await postToolCallAssistantText(
          session.userId,
          "fiscal_residence",
          result.state,
          session.taxYear,
          result.context
        );
      }
    } else if (replace && !use) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { contextJson: stripFiscalProfileConfirmFlag(ctx) as Prisma.InputJsonValue }
      });
      assistantText =
        `Understood — we will re-enter your fiscal profile from scratch.\n\n${firstFiscalFieldPrompt()}`;
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
    const gaps = await resolveIncomeGaps(session.userId, session.taxYear);
    if (gaps.hasBlockingGaps) {
      assistantText = `${gaps.summaryText}\n\n${await incomeCheckpointMessage(session.userId, session.taxYear)}`;
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: "events" }
    });
    assistantText =
      "Got it — we will move on from income.\n\n" + (await eventsCheckpointMessage(session.userId, session.taxYear));
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if ((session.state as ConversationState) === "events" && isEventsConfirmIntent(userContent)) {
    const plan = await loadIntakeModulePlan(session.userId, session.taxYear, ctx);
    const next = nextStateAfterEvents(plan);
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: next }
    });
    const skipCgNote =
      next === "deductions" ? " Capital gains are skipped for your intake focus.\n\n" : "";
    assistantText =
      `Thanks — **derived taxable events** confirmed.${skipCgNote}` + intakeRedirectForState(next, ctx);
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if ((session.state as ConversationState) === "capital_gain" && isCapitalGainSkipIntent(userContent)) {
    const plan = await loadIntakeModulePlan(session.userId, session.taxYear, ctx);
    const next = nextStateAfterCapitalGain(plan);
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: next }
    });
    assistantText =
      `Noted — **no capital gains** this year.\n\n` + intakeRedirectForState("deductions", ctx);
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if ((session.state as ConversationState) === "deductions") {
    const priorAssistant = lastAssistantContent(messages);
    const askedProceed = lastAssistantAskedProceed(priorAssistant);
    const skipDeductions = isDeductionsSkipIntent(userContent);
    const affirmProceed = isShortAffirmativeAdvance(userContent) && askedProceed;
    if (skipDeductions || affirmProceed) {
      const plan = await loadIntakeModulePlan(session.userId, session.taxYear, ctx);
      const next = nextStateAfterDeductions(plan);
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: next }
      });
      const lead = skipDeductions
        ? "Noted — we will treat **deductions** as none for this pass."
        : "Great — moving on.";
      const tail =
        next === "report"
          ? intakeRedirectForState("report", ctx)
          : await formatMonthlyTaxForRecap(session.userId, session.taxYear);
      assistantText = `${lead}\n\n${tail}`;
      await prisma.conversationMessage.create({
        data: { sessionId, role: "assistant", content: assistantText }
      });
      const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { assistantText, sessionState: finalSession.state as ConversationState };
    }
  }

  if ((session.state as ConversationState) === "monthly_calc" && isMonthlyCalcConfirmIntent(userContent)) {
    await prisma.conversationSession.update({
      where: { id: sessionId },
      data: { state: "report" }
    });
    assistantText =
      "Thanks — **monthly totals** confirmed.\n\n" + intakeRedirectForState("report", ctx);
    await prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: assistantText }
    });
    const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { assistantText, sessionState: finalSession.state as ConversationState };
  }

  if (
    isProceedAnywayIntent(userContent) &&
    ["events", "deductions", "capital_gain", "monthly_calc", "report"].includes(
      session.state as ConversationState
    )
  ) {
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
      const gaps = await resolveIncomeGaps(session.userId, session.taxYear);
      const fpRow = await prisma.fiscalResidenceProfile.findUnique({
        where: { userId_taxYear: { userId: session.userId, taxYear: session.taxYear } }
      });
      const needsHandoff =
        session.requiresAdditionalReview ||
        (fpRow?.requiresAdditionalReview ?? false) ||
        gaps.gaps.length > 0;
      if (needsHandoff && !isProceedAnywayIntent(userContent) && !explicitReportCmd) {
        assistantText =
          specialistHandoffBlock(
            session.requiresAdditionalReview || (fpRow?.requiresAdditionalReview ?? false),
            gaps.summaryText
          ) + intakeRedirectForState(stForSummary, ctx);
        await prisma.conversationMessage.create({
          data: { sessionId, role: "assistant", content: assistantText }
        });
        const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
        return { assistantText, sessionState: finalSession.state as ConversationState };
      }
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
      await createClassifiedIncome(session.userId, session.taxYear, draft.data);
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
    const llmCtx = getContext(session);
    const modulePlan = await loadIntakeModulePlan(session.userId, session.taxYear, llmCtx);
    const systemPrompt = buildSystemPrompt(
      session.state as ConversationState,
      session.taxYear,
      llmCtx,
      modulePlan
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
    let refreshed = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    let newState = refreshed.state as ConversationState;
    let newCtx = getContext(refreshed);

    if (prevState === "fiscal_residence" && newState === "fiscal_residence") {
      const fused = fuseUserMessageIntoFiscalContext(newCtx, userContent);
      if (fused) {
        newCtx = fused;
        const finalized = await tryCompleteFiscalResidenceFromContext(
          session.userId,
          session.taxYear,
          newCtx
        );
        if (finalized) {
          newCtx = finalized.context;
          newState = finalized.state;
          await prisma.conversationSession.update({
            where: { id: sessionId },
            data: {
              contextJson: newCtx as Prisma.InputJsonValue,
              state: newState,
              requiresAdditionalReview:
                finalized.requiresAdditionalReview || refreshed.requiresAdditionalReview
            }
          });
        } else {
          await prisma.conversationSession.update({
            where: { id: sessionId },
            data: { contextJson: newCtx as Prisma.InputJsonValue }
          });
        }
        refreshed = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
      }
    }
    const trimmed = content?.trim() ?? "";
    const fiscalToolUsed = hadFiscalResidenceToolCall(toolCalls);
    if (
      fiscalToolUsed &&
      (prevState === "fiscal_residence" || newState === "fiscal_residence")
    ) {
      assistantText = await postToolCallAssistantText(
        session.userId,
        prevState,
        newState,
        session.taxYear,
        newCtx
      );
    } else if (trimmed) {
      assistantText = trimmed;
      if (newState === "income_capture") {
        assistantText += `\n\n${await resolveIntakeRedirect("income_capture", newCtx, session.userId, session.taxYear)}`;
      } else if (
        newState === "fiscal_residence" &&
        !messageAlreadyAsksQuestion(trimmed)
      ) {
        assistantText += `\n\n${await resolveIntakeRedirect("fiscal_residence", newCtx, session.userId, session.taxYear)}`;
      } else if (newState === "events" || newState === "monthly_calc") {
        assistantText += `\n\n${await resolveIntakeRedirect(newState, newCtx, session.userId, session.taxYear)}`;
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
