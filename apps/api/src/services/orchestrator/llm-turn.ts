import type { ConversationState } from "@tax-platform/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { runAssistantWithTools } from "../llm.js";
import { config } from "../../config.js";
import { loadIntakeModulePlan } from "../intake-helpers.js";
import {
  fuseUserMessageIntoFiscalContext,
  syncLastAskedKeyFromAssistantText,
  templateFiscalResidence,
  tryCompleteFiscalResidenceFromContext
} from "./fiscal-orchestration.js";
import { lastAssistantContent } from "./intents.js";
import {
  incomeCheckpointMessage,
  intakeRedirectForState,
  postToolCallAssistantText,
  resolveIntakeRedirect
} from "./messages.js";
import { getContext } from "./session-context.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { applyToolCalls, hadFiscalResidenceToolCall } from "./tool-calls.js";
import type { HandlerContext } from "./session-context.js";

export async function runLlmTurn(h: HandlerContext): Promise<string> {
  const { sessionId, session, userContent, messages } = h;

  if (!config.llmEnabled) {
    if (session.state === "fiscal_residence") {
      return templateFiscalResidence(sessionId, session, userContent, resolveIntakeRedirect);
    }
    return `Current step: **${session.state}**. Guided chat is not available in this environment (the assistant needs to be enabled on the server). Please try again later or contact support.`;
  }

  const prevState = session.state as ConversationState;
  const llmCtx = getContext(session);
  const modulePlan = await loadIntakeModulePlan(session.userId, session.taxYear, llmCtx);
  const systemPrompt = buildSystemPrompt(
    session.state as ConversationState,
    session.taxYear,
    llmCtx,
    modulePlan
  );
  const history = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content
  }));
  const { content, toolCalls } = await runAssistantWithTools({
    systemPrompt,
    userMessages: history
  });
  const toolResult =
    toolCalls.length > 0
      ? await applyToolCalls(session.userId, session.taxYear, sessionId, toolCalls, session)
      : { incomeRowsSaved: 0 };
  const hadIncomeTool = toolCalls.some(
    (c) => c.type === "function" && c.function.name === "submit_income_source"
  );
  let refreshed = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
  let newState = refreshed.state as ConversationState;
  let newCtx = getContext(refreshed);

  if (prevState === "fiscal_residence" && newState === "fiscal_residence") {
    const fused = fuseUserMessageIntoFiscalContext(newCtx, userContent, lastAssistantContent(messages));
    if (fused) {
      newCtx = fused;
      const finalized = await tryCompleteFiscalResidenceFromContext(
        session.userId,
        session.taxYear,
        newCtx
      );
      if (finalized) {
        newCtx = finalized.context;
        newState = finalized.state;
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: {
            contextJson: newCtx as Prisma.InputJsonValue,
            state: newState,
            requiresAdditionalReview:
              finalized.requiresAdditionalReview || refreshed.requiresAdditionalReview
          }
        });
      } else {
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { contextJson: newCtx as Prisma.InputJsonValue }
        });
      }
      refreshed = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    }
  }

  const trimmed = content?.trim() ?? "";
  const fiscalToolUsed = hadFiscalResidenceToolCall(toolCalls);
  if (
    fiscalToolUsed &&
    (prevState === "fiscal_residence" || newState === "fiscal_residence")
  ) {
    return postToolCallAssistantText(
      session.userId,
      prevState,
      newState,
      session.taxYear,
      newCtx
    );
  }
  if (trimmed) {
    if (newState === "fiscal_residence") {
      const withAskedKey = syncLastAskedKeyFromAssistantText(newCtx, trimmed);
      if (withAskedKey !== newCtx) {
        newCtx = withAskedKey;
        await prisma.conversationSession.update({
          where: { id: sessionId },
          data: { contextJson: newCtx as Prisma.InputJsonValue }
        });
      }
    }
    let assistantText = trimmed;
    if (newState === "income_capture") {
      assistantText += `\n\n${await resolveIntakeRedirect("income_capture", newCtx, session.userId, session.taxYear)}`;
    } else if (newState === "events" || newState === "monthly_calc") {
      assistantText += `\n\n${await resolveIntakeRedirect(newState, newCtx, session.userId, session.taxYear)}`;
    }
    return assistantText;
  }
  if (toolCalls.length) {
    if (
      prevState === "income_capture" &&
      hadIncomeTool &&
      toolResult.incomeRowsSaved === 0
    ) {
      return (
        `I could not save an income row from that message. Include **gross amount**, **3-letter currency**, **payment date (YYYY-MM-DD)**, **periodicity** (monthly / one_off / annual / recurring), payer, country, and income type—or use a short line like \`10900 USD 2026-01-31\` or \`10900 USD per month\`.\n\n` +
        (await incomeCheckpointMessage(session.userId, session.taxYear))
      );
    }
    return postToolCallAssistantText(
      session.userId,
      prevState,
      newState,
      session.taxYear,
      newCtx
    );
  }
  if (newState === "income_capture") {
    return incomeCheckpointMessage(session.userId, session.taxYear);
  }
  return intakeRedirectForState(newState, newCtx);
}
