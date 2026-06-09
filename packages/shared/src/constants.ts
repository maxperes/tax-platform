/** Engine semver; bump when calculation algorithms change. */
export const ENGINE_VERSION = "0.2.0";

/** Data pack ids (per jurisdiction/year); bump when statutory tables change. */
export const DATA_PACK_BR_2026 = "br-2026-1";
export const DATA_PACK_US_2026 = "us-2026-1";

/** Full stamp persisted on calculations/reports: engine + data pack id (e.g. br-2026-1). */
export function buildRuleVersionStamp(dataPackId: string, overrideFingerprint?: string): string {
  const base = `engine@${ENGINE_VERSION}+data@${dataPackId}`;
  if (!overrideFingerprint) return base;
  return `${base}+overrides@${overrideFingerprint}`;
}

/** Default stamp for BR data pack (backward compatible export name). */
export const RULE_VERSION = buildRuleVersionStamp(DATA_PACK_BR_2026);

export const CONVERSATION_STATES = [
  "fiscal_residence",
  "income_capture",
  "events",
  "capital_gain",
  "deductions",
  "monthly_calc",
  "report",
  "complete"
] as const;

export type ConversationState = (typeof CONVERSATION_STATES)[number];
