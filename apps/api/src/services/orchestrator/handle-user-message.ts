import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import type { LlmStreamEvent } from "../llm.js";
import { handleAdvanceIntent } from "./handlers/advance-intent.js";
import { handleChatIncomeAmendment } from "./handlers/chat-income-amendment.js";
import { handleFiscalClarify } from "./handlers/fiscal-clarify.js";
import { handleFiscalConfirm } from "./handlers/fiscal-confirm.js";
import { handleFiscalFieldAnswer } from "./handlers/fiscal-field-answer.js";
import { handleHelp } from "./handlers/help.js";
import { handleAssetScreen } from "./handlers/asset-screen.js";
import { handleIncomeDone } from "./handlers/income-done.js";
import { handleIncomeFx } from "./handlers/income-fx.js";
import { handleOffTopic } from "./handlers/off-topic.js";
import { handleReportFinalize } from "./handlers/report-finalize.js";
import { handleRewind } from "./handlers/rewind.js";
import { handleStepAdvance } from "./handlers/step-advance.js";
import { handleTriage } from "./handlers/triage.js";
import { handleTriageClarify } from "./handlers/triage-clarify.js";
import { handleTrust } from "./handlers/trust.js";
import { handleUsFiling } from "./handlers/us-filing.js";
import { runLlmTurn } from "./llm-turn.js";
import {
  getContext,
  replyAndReturn,
  type HandlerContext,
  type HandlerResult
} from "./session-context.js";

type HandlerFnLocal = (h: HandlerContext) => Promise<HandlerResult>;

const HANDLER_PIPELINE: HandlerFnLocal[] = [
  handleTrust,
  handleHelp,
  handleTriageClarify,
  handleTriage,
  handleFiscalClarify,
  handleUsFiling,
  handleFiscalConfirm,
  handleRewind,
  handleAssetScreen,
  handleIncomeFx,
  handleIncomeDone,
  handleStepAdvance,
  handleReportFinalize,
  handleAdvanceIntent,
  handleFiscalFieldAnswer,
  handleOffTopic,
  handleChatIncomeAmendment
];

export type OrchestratorStreamEvent =
  | LlmStreamEvent
  | { type: "status"; message: string };

export async function handleUserMessage(
  sessionId: string,
  userContent: string,
  onEvent?: (ev: OrchestratorStreamEvent) => void
): Promise<{
  assistantText: string;
  sessionState: ConversationState;
}> {
  const session = await prisma.conversationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");

  await prisma.conversationMessage.create({
    data: { sessionId, role: "user", content: userContent }
  });

  const messages = await prisma.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 40
  });
  messages.reverse();

  const handlerCtx: HandlerContext = {
    sessionId,
    session: {
      id: session.id,
      userId: session.userId,
      taxYear: session.taxYear,
      state: session.state,
      contextJson: session.contextJson,
      requiresAdditionalReview: session.requiresAdditionalReview
    },
    userContent,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ctx: getContext(session)
  };

  for (const handler of HANDLER_PIPELINE) {
    const result = await handler(handlerCtx);
    if (result) {
      if (onEvent) {
        onEvent({ type: "delta", text: result.assistantText });
      }
      return replyAndReturn(sessionId, result.assistantText, false);
    }
  }

  onEvent?.({ type: "status", message: "assistant_thinking" });
  const assistantText = await runLlmTurn(handlerCtx, onEvent);
  return replyAndReturn(sessionId, assistantText, true);
}
