import type { ConversationState } from "@tax-platform/shared";
import { usFilingPromptText } from "../../intake-helpers.js";
import { fiscalProfileConfirmPromptText, isFiscalProfileConfirmPending } from "../fiscal-orchestration.js";
import { isAdvanceIntent } from "../intents.js";
import { incomeCheckpointMessage, resolveIntakeRedirect } from "../messages.js";
import { assetScreenPromptText, isAssetScreenPending } from "./asset-screen.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleAdvanceIntent(h: HandlerContext): Promise<HandlerResult> {
  if (!isAdvanceIntent(h.userContent)) return null;

  const st = h.session.state as ConversationState;
  if (st === "income_capture") {
    if (isAssetScreenPending(h.ctx)) {
      return { assistantText: assetScreenPromptText() };
    }
    return { assistantText: await incomeCheckpointMessage(h.session.userId, h.session.taxYear) };
  }
  if (st === "fiscal_residence") {
    if (isFiscalProfileConfirmPending(h.ctx)) {
      return {
        assistantText: `First, confirm the saved profile: ${fiscalProfileConfirmPromptText()}`
      };
    }
    if (h.ctx._usFilingPending === true) {
      return { assistantText: usFilingPromptText(h.ctx) };
    }
    return {
      assistantText:
        "As soon as your fiscal profile is complete, we will move on automatically. If you are stuck, say **help** or repeat the last question."
    };
  }
  return {
    assistantText: await resolveIntakeRedirect(st, h.ctx, h.session.userId, h.session.taxYear)
  };
}
