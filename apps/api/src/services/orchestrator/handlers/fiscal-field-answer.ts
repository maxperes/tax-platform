import type { ConversationState } from "@tax-platform/shared";
import { parseBool } from "../../fiscal-intake.js";
import { isTriagePending } from "../../intake-helpers.js";
import {
  getFiscalPromptForAskedField,
  isFiscalProfileConfirmPending,
  resolveFiscalFieldBeingAsked,
  resolveFiscalFieldForUserAnswer,
  templateFiscalResidence
} from "../fiscal-orchestration.js";
import { lastAssistantContent } from "../intents.js";
import { resolveIntakeRedirect } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleFiscalFieldAnswer(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence") return null;
  if (isTriagePending(h.ctx) || isFiscalProfileConfirmPending(h.ctx)) return null;
  if (h.ctx._usFilingPending === true) return null;

  const lastAssistant = lastAssistantContent(h.messages);
  const fieldKey = resolveFiscalFieldForUserAnswer(h.ctx, h.userContent, lastAssistant);
  if (!fieldKey) {
    const asked = resolveFiscalFieldBeingAsked(h.ctx, lastAssistant);
    if (
      asked === "immigrationStatus" &&
      (parseBool(h.userContent) !== undefined || /^(yes|no)\b/i.test(h.userContent.trim()))
    ) {
      return {
        assistantText:
          "Immigration status is a **category**, not yes/no. Pick from the list (or **not sure**).\n\n" +
          getFiscalPromptForAskedField(h.ctx, lastAssistant)
      };
    }
    return null;
  }

  const assistantText = await templateFiscalResidence(
    h.sessionId,
    h.session,
    h.userContent,
    lastAssistant,
    resolveIntakeRedirect
  );
  return { assistantText };
}
