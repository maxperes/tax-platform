import type { ConversationState } from "@tax-platform/shared";
import { parsePaymentLines } from "../income-multi-parse.js";
import {
  getActiveFiscalFieldOrder,
  isValidFiscalFieldValue,
  looksLikeFiscalFieldAnswer
} from "../fiscal-intake.js";
import { isTriagePending, parseIntakeGoal, parseUsFilingInputs } from "../intake-helpers.js";
import {
  getFiscalResidenceMergedFields,
  isConfirmReplaceFiscalProfile,
  isConfirmUseStoredFiscalProfile,
  isFiscalProfileConfirmPending
} from "./fiscal-orchestration.js";

export function isTrustOrComplianceConcern(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  const trustKeywords =
    /\b(store|stored|save|saved|retain|retention|privacy|private|data|security|secure|encrypt|encrypted|access|who can access|share|shared|delete|deletion|erase|remove|export|download my data|confidential|confidentiality|consent|lgpd|gdpr)\b/i;
  return trustKeywords.test(lower);
}

export function isLikelyOffTopicUserMessage(
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

export function messageAlreadyAsksQuestion(text: string): boolean {
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
