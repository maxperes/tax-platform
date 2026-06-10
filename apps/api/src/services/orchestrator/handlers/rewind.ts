import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../../db.js";
import { conversationStateRank } from "../../conversation-state-heal.js";
import { parseRewindTargetStep } from "../../conversation-rewind.js";
import { resolveIntakeRedirect } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleRewind(h: HandlerContext): Promise<HandlerResult> {
  const rewindTarget = parseRewindTargetStep(h.userContent);
  if (!rewindTarget) return null;

  const curState = h.session.state as ConversationState;
  if (conversationStateRank(rewindTarget) >= conversationStateRank(curState)) return null;

  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: { state: rewindTarget }
  });
  const stepLabel = rewindTarget.replace(/_/g, " ");
  const assistantText =
    `Opening **${stepLabel}** so you can update earlier answers. Your existing rows stay in the database until you change them.\n\n` +
    (await resolveIntakeRedirect(rewindTarget, h.ctx, h.session.userId, h.session.taxYear));
  return { assistantText };
}
