import type { ConversationState } from "@tax-platform/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { healStateIfAssistantAnnouncedLaterStep } from "../conversation-state-heal.js";

/** Parsed payment-line text can create IncomeSource rows without rewinding from Done. */
export const STATES_ALLOWING_CHAT_INCOME_AMENDMENT = new Set<ConversationState>([
  "income_capture",
  "events",
  "deductions",
  "capital_gain",
  "monthly_calc",
  "report",
  "complete"
]);

export type HandlerSession = {
  id: string;
  userId: string;
  taxYear: number;
  state: string;
  contextJson: Prisma.JsonValue | null;
  requiresAdditionalReview: boolean;
};

export type HandlerMessage = {
  role: string;
  content: string;
};

export type HandlerContext = {
  sessionId: string;
  session: HandlerSession;
  userContent: string;
  messages: HandlerMessage[];
  ctx: Record<string, unknown>;
};

export type HandlerResult = { assistantText: string } | null;

export function getContext(session: { contextJson: Prisma.JsonValue | null }): Record<string, unknown> {
  return (session.contextJson as Record<string, unknown>) ?? {};
}

export async function replyAndReturn(
  sessionId: string,
  assistantText: string,
  heal = true
): Promise<{ assistantText: string; sessionState: ConversationState }> {
  if (heal) {
    const prePersistSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
    const healedState = healStateIfAssistantAnnouncedLaterStep(
      assistantText,
      prePersistSession.state as ConversationState
    );
    if (healedState) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { state: healedState }
      });
    }
  }

  await prisma.conversationMessage.create({
    data: { sessionId, role: "assistant", content: assistantText }
  });

  const finalSession = await prisma.conversationSession.findUniqueOrThrow({ where: { id: sessionId } });
  return { assistantText, sessionState: finalSession.state as ConversationState };
}
