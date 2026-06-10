import type { ConversationState } from "@tax-platform/shared";
import { INTAKE_GOAL_OPTIONS, isTriagePending, triagePromptText } from "../../intake-helpers.js";
import { isTriageClarificationQuestion } from "../intents.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export function triageOptionsExplanationText(): string {
  const lines = INTAKE_GOAL_OPTIONS.map(
    (o) => `- **${o.id}** — ${o.label}`
  );
  return (
    "**Intake focus options:**\n" +
    lines.join("\n") +
    "\n\nPick the closest match, or use **full_annual** if several apply."
  );
}

export async function handleTriageClarify(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence" || !isTriagePending(h.ctx)) {
    return null;
  }
  if (!isTriageClarificationQuestion(h.userContent)) return null;

  return {
    assistantText: `${triageOptionsExplanationText()}\n\n${triagePromptText()}`
  };
}
