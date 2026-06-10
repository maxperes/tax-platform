import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../../db.js";
import { eventsCheckpointMessage } from "../../intake-helpers.js";
import { resolveIncomeGaps } from "../../intake-helpers.js";
import { isIncomeCaptureDoneIntent } from "../intents.js";
import { incomeCheckpointMessage } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleIncomeDone(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "income_capture") return null;
  if (!isIncomeCaptureDoneIntent(h.userContent)) return null;

  const gaps = await resolveIncomeGaps(h.session.userId, h.session.taxYear);
  if (gaps.hasBlockingGaps) {
    return {
      assistantText: `${gaps.summaryText}\n\n${await incomeCheckpointMessage(h.session.userId, h.session.taxYear)}`
    };
  }

  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: { state: "events" }
  });
  return {
    assistantText:
      "Got it — we will move on from income.\n\n" +
      (await eventsCheckpointMessage(h.session.userId, h.session.taxYear))
  };
}
