/** User confirms there are no taxable events to report (events step). */

export function isEventsSkipIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /^none\b/i.test(lower) ||
    /^n\/a\b/i.test(lower) ||
    /^nope\b/i.test(lower) ||
    /\bno\s+taxable\s+events?\b/i.test(lower) ||
    /\bno\s+events?\b/i.test(lower) ||
    /\bzero\s+taxable\s+events?\b/i.test(lower) ||
    /\bnothing\s+to\s+report\b/i.test(lower) ||
    /\bdon'?t\s+have\s+any(\s+taxable\s+events?)?\b/i.test(lower) ||
    /\b(have|there\s+are|there\s+is)\s+none\b/i.test(lower) ||
    /^skip(\s+events?)?\b/i.test(lower) ||
    /\bnot\s+applicable\b/i.test(lower)
  );
}

export function lastAssistantAskedEventNoneConfirmation(assistantText: string): boolean {
  const lower = assistantText.toLowerCase();
  return (
    /\bconfirm\s+if\s+there\s+are\s+none\b/i.test(lower) ||
    /\bif\s+you\s+don'?t\s+have\s+any\b/i.test(lower) ||
    /\bor\s+confirm\s+if\s+there\s+are\s+none\b/i.test(lower) ||
    /\bplease\s+confirm\s+that\s+as\s+well\b/i.test(lower)
  );
}
