import { CONVERSATION_STATES, type ConversationState } from "@tax-platform/shared";

export function conversationStateRank(s: ConversationState): number {
  const i = CONVERSATION_STATES.indexOf(s);
  return i >= 0 ? i : -1;
}

/** Ignore backwards or same-step advances from the model (prevents deductions → events). */
export function normalizeForwardAdvance(
  currentState: ConversationState,
  requestedNext: unknown
): ConversationState | null {
  if (typeof requestedNext !== "string") return null;
  if (!CONVERSATION_STATES.includes(requestedNext as ConversationState)) return null;
  const next = requestedNext as ConversationState;
  const cur = conversationStateRank(currentState);
  const nxt = conversationStateRank(next);
  if (nxt <= cur) return null;
  return next;
}

/**
 * If the model describes a later workflow step in prose but forgot advance_conversation_state,
 * return that step so the DB (and UI header) can align. Only from "events" onward.
 */
export function healStateIfAssistantAnnouncedLaterStep(
  assistantText: string,
  currentState: ConversationState
): ConversationState | null {
  if (conversationStateRank(currentState) < conversationStateRank("events")) return null;
  const head = assistantText.trim().slice(0, 450);
  if (!head) return null;
  const lower = head.toLowerCase();
  const cur = conversationStateRank(currentState);

  const signals: { state: ConversationState; match: boolean }[] = [
    {
      state: "events",
      match:
        /\b(let['']?s\s+)?(move|moving)\s+on\s+to\s+(taxable\s+events?|events?\b)/i.test(lower) ||
        /\bnow\s*,?\s+(for\s+)?taxable\s+events?\b/i.test(lower)
    },
    {
      state: "deductions",
      match:
        /\b(let['']?s\s+)?(move|moving)\s+on\s+to\s+deductions?\b/i.test(lower) ||
        /\bgo\s+to\s+(the\s+)?deductions?\b/i.test(lower) ||
        /\bfirst\s+type\s+of\s+deduction\b/i.test(lower) ||
        /\bdeduction\s+you\s+would\s+like\s+to\s+claim\b/i.test(lower)
    },
    {
      state: "capital_gain",
      match:
        /\b(let['']?s\s+)?(move|moving)\s+on\s+to\s+capital\s+gains?\b/i.test(lower) ||
        /\bcapital\s+gains?\s+(step|calculation|part)\b/i.test(lower)
    },
    {
      state: "monthly_calc",
      match:
        /\b(move|moving)\s+on\s+to\s+(the\s+)?monthly\b/i.test(lower) ||
        /\bmonthly\s+tax\s+(calc|calculation)\b/i.test(lower)
    },
    {
      state: "report",
      match:
        /\b(move|moving)\s+on\s+to\s+(the\s+)?report\b/i.test(lower) ||
        /\b(your\s+)?tax\s+report\s+(summary|review)\b/i.test(lower)
    }
  ];

  let best: ConversationState | null = null;
  let bestRank = cur;
  for (const { state, match } of signals) {
    if (!match) continue;
    const r = conversationStateRank(state);
    if (r > cur && r > bestRank) {
      best = state;
      bestRank = r;
    }
  }
  return best;
}
