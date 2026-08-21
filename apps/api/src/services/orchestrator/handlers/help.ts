import type { ConversationState } from "@tax-platform/shared";
import { isTriagePending, triagePromptText, usFilingPromptText } from "../../intake-helpers.js";
import {
  fiscalProfileConfirmPromptText,
  isFiscalProfileConfirmPending
} from "../fiscal-orchestration.js";
import { isHelpIntent, lastAssistantContent } from "../intents.js";
import { incomeCheckpointMessage, intakeRedirectForState } from "../messages.js";
import { assetScreenPromptText, isAssetScreenPending } from "./asset-screen.js";
import { buildFiscalClarifyReply } from "./fiscal-clarify.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleHelp(h: HandlerContext): Promise<HandlerResult> {
  if (!isHelpIntent(h.userContent)) return null;

  const state = h.session.state as ConversationState;
  let body: string;

  if (state === "fiscal_residence") {
    // Match open-question priority: confirm → triage → US filing → fields.
    if (isFiscalProfileConfirmPending(h.ctx)) {
      body = `**Help — saved profile**\n\n${fiscalProfileConfirmPromptText()}`;
    } else if (isTriagePending(h.ctx)) {
      body = `**Help — choose your focus**\n\n${triagePromptText()}`;
    } else if (h.ctx._usFilingPending === true) {
      body = `**Help — US filing**\n\n${usFilingPromptText(h.ctx)}`;
    } else {
      body = `**Help — fiscal profile**\n\n${buildFiscalClarifyReply(h.ctx, lastAssistantContent(h.messages))}`;
    }
  } else if (state === "income_capture" && isAssetScreenPending(h.ctx)) {
    body = `**Help — assets**\n\n${assetScreenPromptText()}`;
  } else if (state === "income_capture") {
    const checkpoint = await incomeCheckpointMessage(h.session.userId, h.session.taxYear);
    body =
      `**Help — income**\n\n` +
      "Add the same facts as the interview: category, approximate **annual** amount, currency, and country. " +
      "Open the **income table** below for structured entry. Say **that's all** when finished.\n\n" +
      checkpoint;
  } else if (state === "deductions") {
    body =
      `**Help — deductions**\n\n` +
      intakeRedirectForState("deductions", h.ctx) +
      "\n\nOpen the **deductions table** below, or say **no deductions** to skip.";
  } else {
    body =
      `**Help — step ${state.replace(/_/g, " ")}**\n\n` +
      intakeRedirectForState(state, h.ctx) +
      "\n\nSay **go back to income** (or another step) to edit earlier answers.";
  }

  return { assistantText: body };
}
