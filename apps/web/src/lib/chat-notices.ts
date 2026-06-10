type Session = {
  messages: { id: string }[];
  requiresAdditionalReview: boolean;
};

export const NOTICE_WELCOME_BACK = {
  id: "welcome_back",
  title: "Welcome back",
  body: "Welcome back. We saved your progress automatically and will continue from the current step."
} as const;

export const NOTICE_ADDITIONAL_REVIEW = {
  id: "additional_review",
  title: "Additional review",
  body: "This case is flagged for **additional review**. Say **proceed anyway** in chat to generate a preliminary report, or fix flagged items first."
} as const;

export const NOTICE_RULES_OUTDATED = {
  id: "rules_outdated",
  title: "Tax rules updated",
  body: "Statutory tables or rule overrides changed since your last calculation. Re-run **monthly calc** or **regenerate report** in chat so figures match current law."
} as const;

export type SessionNotice = {
  id: string;
  title: string;
  body: string;
  kind: "welcome" | "review" | "rules";
};

export function activeSessionNotices(session: Session): SessionNotice[] {
  const list: SessionNotice[] = [];
  if (session.messages.length > 1) {
    list.push({
      id: NOTICE_WELCOME_BACK.id,
      title: NOTICE_WELCOME_BACK.title,
      body: NOTICE_WELCOME_BACK.body,
      kind: "welcome"
    });
  }
  if (session.requiresAdditionalReview) {
    list.push({
      id: NOTICE_ADDITIONAL_REVIEW.id,
      title: NOTICE_ADDITIONAL_REVIEW.title,
      body: NOTICE_ADDITIONAL_REVIEW.body,
      kind: "review"
    });
  }
  return list;
}

export const welcomeBannerStorageKey = (id: string) => `tax-platform-chat-dismiss-welcome-${id}`;
export const reviewBannerStorageKey = (id: string) => `tax-platform-chat-dismiss-review-${id}`;
export const rulesFreshnessBannerStorageKey = (id: string) => `tax-platform-chat-dismiss-rules-${id}`;
export const noticeReadIdsStorageKey = (id: string) => `tax-platform-chat-notices-read-${id}`;

export function loadNoticeReadIds(sessionId: string): Set<string> {
  try {
    const raw = localStorage.getItem(noticeReadIdsStorageKey(sessionId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

export function saveNoticeReadIds(sessionId: string, ids: Set<string>): void {
  localStorage.setItem(noticeReadIdsStorageKey(sessionId), JSON.stringify([...ids]));
}
