import type { ConversationState } from "@tax-platform/shared";
import type { Prisma } from "../../../prisma-client.js";
import { prisma } from "../../../db.js";
import { resolveIncomeGaps } from "../../intake-helpers.js";
import { isIncomeCaptureDoneIntent } from "../intents.js";
import { incomeCheckpointMessage } from "../messages.js";
import { ASSET_SCREEN_PENDING_KEY, assetScreenPromptText } from "./asset-screen.js";
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

  const newCtx = { ...h.ctx, [ASSET_SCREEN_PENDING_KEY]: true };
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: { contextJson: newCtx as Prisma.InputJsonValue }
  });
  return {
    assistantText:
      "Income list is saved. One more question about **assets**, then we review how that income is classified.\n\n" +
      assetScreenPromptText()
  };
}
