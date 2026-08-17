import type { ConversationState } from "@tax-platform/shared";
import { parsePaymentLines } from "../income-multi-parse.js";
import { looksLikeDateAnswer } from "../fiscal-intake.js";
import { isTriagePending, parseIntakeGoal, parseUsFilingInputs } from "../intake-helpers.js";
import {
  isConfirmReplaceFiscalProfile,
  isConfirmUseStoredFiscalProfile,
  isFiscalProfileConfirmPending,
  resolveFiscalFieldForUserAnswer
} from "./fiscal-orchestration.js";

export function isHelpIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  return /^(help|repeat|i['']?m\s+stuck|what\s+do\s+i\s+do)\b/i.test(lower);
}

export function isTriageClarificationQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes("?") ||
    /\b(what is|what's|whats|difference|explain|mean|which one|how do i choose)\b/i.test(t)
  );
}

export function isFiscalClarificationQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isHelpIntent(text)) return false;
  return (
    t.includes("?") ||
    /^(explain|why|what|huh)$/i.test(t) ||
    /\b(what is|what's|whats|what does|explain|mean|why do you need|iso code|country code)\b/i.test(t)
  );
}

export function isTrustOrComplianceConcern(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  const privacyTopic =
    /\b(privacy|private|security|secure|encrypt(?:ed|ion)?|confidential(?:ity)?|consent|lgpd|gdpr|retention|who can access|download my data)\b/i;
  if (privacyTopic.test(lower)) return true;
  const actionVerb =
    /\b(store|stored|save|saved|retain|data|access|share|shared|delete|deletion|erase|remove|export)\b/i;
  if (!actionVerb.test(lower)) return false;
  // Require question/concern framing so intake prose like "save this amount" is not stolen.
  return (
    /\?/.test(lower) ||
    /\b(how|where|do you|will you|can you|is my|my data|my info|my information)\b/i.test(lower) ||
    /\b(worried|concern(?:ed)?|safe|trust)\b/i.test(lower)
  );
}

export function isLikelyOffTopicUserMessage(
  state: ConversationState,
  context: Record<string, unknown>,
  userContent: string,
  lastAssistantText?: string
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
      if (isTriageClarificationQuestion(t)) return false;
      return true;
    }
    if (isFiscalProfileConfirmPending(context)) {
      if (isConfirmUseStoredFiscalProfile(t) || isConfirmReplaceFiscalProfile(t)) return false;
      return true;
    }
    if (context._usFilingPending === true) {
      if (parseUsFilingInputs(t, context)) return false;
      return true;
    }
    if (isFiscalClarificationQuestion(t)) return false;
    if (looksLikeDateAnswer(t)) return false;
    const chitChat =
      /\b(weather|joke|recipe|movie|sport|football|soccer|nba|who won|world cup|translate|poem|story|chatgpt|linux|windows|macos|javascript|python)\b/i;
    if (chitChat.test(t)) return true;
    if (resolveFiscalFieldForUserAnswer(context, t, lastAssistantText)) return false;
    return true;
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

export function isAdvanceIntent(userContent: string): boolean {
  return /^(next(\s+step)?|continue|proceed|go\s+ahead|move\s+on)\b/i.test(userContent.trim());
}

/** User is done listing incomes (possibly zero); advance to the next workflow step. */
export function isIncomeCaptureDoneIntent(userContent: string): boolean {
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

export function lastAssistantContent(msgs: { role: string; content: string }[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === "assistant") return m.content;
  }
  return "";
}

export function isDeductionsSkipIntent(userContent: string): boolean {
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

export function isShortAffirmativeAdvance(userContent: string): boolean {
  const t = userContent.trim().toLowerCase();
  if (!t) return false;
  return /^(yes|yep|yeah|sure|ok|okay)\b/i.test(t) && t.length < 48;
}

export function lastAssistantAskedProceed(lastAssistantText: string): boolean {
  const lower = lastAssistantText.toLowerCase();
  return (
    /\bproceed\s+to\s+(the\s+)?next\s+step\b/i.test(lower) ||
    /\bwould\s+you\s+like\s+to\s+proceed\b/i.test(lower) ||
    /\bmove\s+on\s+to\s+the\s+next\b/i.test(lower)
  );
}
