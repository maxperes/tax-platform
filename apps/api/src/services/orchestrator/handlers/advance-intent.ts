import type { ConversationState } from "@tax-platform/shared";
import { fiscalProfileConfirmPromptText, isFiscalProfileConfirmPending } from "../fiscal-orchestration.js";
import { isAdvanceIntent } from "../intents.js";
import { incomeCheckpointMessage, resolveIntakeRedirect } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleAdvanceIntent(h: HandlerContext): Promise<HandlerResult> {
  if (!isAdvanceIntent(h.userContent)) return null;

  const st = h.session.state as ConversationState;
  if (st === "income_capture") {
    return { assistantText: await incomeCheckpointMessage(h.session.userId, h.session.taxYear) };
  }
  if (st === "fiscal_residence") {
    return {
      assistantText: isFiscalProfileConfirmPending(h.ctx)
        ? `First, confirm the saved profile: ${fiscalProfileConfirmPromptText()}`
        : "As soon as your fiscal profile is complete, we will move on automatically. If you are stuck, say **help** or repeat the last question."
    };
  }
  return {
    assistantText: await resolveIntakeRedirect(st, h.ctx, h.session.userId, h.session.taxYear)
  };
}
