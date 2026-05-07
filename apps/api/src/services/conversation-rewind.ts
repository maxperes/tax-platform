import type { ConversationState } from "@tax-platform/shared";

/**
 * Detect user intent to jump back to an earlier intake step (e.g. from "complete").
 * Requires a navigation verb so casual mentions ("income tax") do not rewind.
 */
export function parseRewindTargetStep(userContent: string): ConversationState | null {
  const raw = userContent.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const navigational =
    /\b(back\s+to|return\s+to|go\s+back\s+to|jump\s+to|switch\s+to|revisit|open\s+the)\b/i.test(lower) ||
    /\b(edit|update|change|fix|correct)\s+(my\s+)?(the\s+)?/i.test(lower);
  if (!navigational) return null;

  if (/\bfiscal|first\s+questions|profile\s+questions|residency\s+questions\b/i.test(lower)) return "fiscal_residence";
  if (/\bincome\b/i.test(lower)) return "income_capture";
  if (/\b(taxable\s+)?events?\b/i.test(lower)) return "events";
  if (/\bdeductions?\b/i.test(lower)) return "deductions";
  if (/\bcapital\s*gains?\b/i.test(lower)) return "capital_gain";
  if (/\bmonthly\b/i.test(lower)) return "monthly_calc";
  if (/\breport\b/i.test(lower)) return "report";
  return null;
}
