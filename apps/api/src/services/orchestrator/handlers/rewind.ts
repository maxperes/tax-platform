import type { ConversationState } from "@tax-platform/shared";
import type { Prisma } from "../../../prisma-client.js";
import { prisma } from "../../../db.js";
import { conversationStateRank } from "../../conversation-state-heal.js";
import { parseRewindTargetStep } from "../../conversation-rewind.js";
import { resolveIntakeRedirect } from "../messages.js";
import { ASSET_SCREEN_PENDING_KEY } from "./asset-screen.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

/** Ephemeral phase flags that must not survive a rewind into an earlier step. */
function clearPendingFlagsForRewind(
  context: Record<string, unknown>,
  rewindTarget: ConversationState
): Record<string, unknown> {
  const next = { ...context };
  delete next[ASSET_SCREEN_PENDING_KEY];
  delete next._assetCountryQueue;
  delete next._fiscalProfileConfirmPending;
  if (rewindTarget === "fiscal_residence") {
    delete next._triagePending;
    // US filing will be re-armed by completeFiscalProfile if still needed.
    delete next._usFilingPending;
  } else if (conversationStateRank(rewindTarget) < conversationStateRank("income_capture")) {
    delete next._usFilingPending;
  }
  return next;
}

export async function handleRewind(h: HandlerContext): Promise<HandlerResult> {
  const rewindTarget = parseRewindTargetStep(h.userContent);
  if (!rewindTarget) return null;

  const curState = h.session.state as ConversationState;
  if (conversationStateRank(rewindTarget) >= conversationStateRank(curState)) return null;

  const nextCtx = clearPendingFlagsForRewind(h.ctx, rewindTarget);
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: {
      state: rewindTarget,
      contextJson: nextCtx as Prisma.InputJsonValue
    }
  });
  const stepLabel = rewindTarget.replace(/_/g, " ");
  const assistantText =
    `Opening **${stepLabel}** so you can update earlier answers. Your existing rows stay in the database until you change them.\n\n` +
    (await resolveIntakeRedirect(rewindTarget, nextCtx, h.session.userId, h.session.taxYear));
  return { assistantText };
}
