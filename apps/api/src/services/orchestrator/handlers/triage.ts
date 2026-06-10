import { fiscalResidenceSchema } from "@tax-platform/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import { firstFiscalFieldPrompt } from "../../fiscal-intake.js";
import { isTriagePending, parseIntakeGoal } from "../../intake-helpers.js";
import {
  buildAssistantMessageForExistingFiscalProfile,
  isFiscalProfileConfirmPending
} from "../fiscal-orchestration.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";
import type { ConversationState } from "@tax-platform/shared";

export async function handleTriage(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence" || !isTriagePending(h.ctx)) {
    return null;
  }
  const goal = parseIntakeGoal(h.userContent);
  if (!goal) return null;

  const newCtx = { ...h.ctx, intakeGoal: goal, _triagePending: false };
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: { contextJson: newCtx as Prisma.InputJsonValue }
  });

  let assistantText: string;
  if (isFiscalProfileConfirmPending(newCtx)) {
    const row = await prisma.fiscalResidenceProfile.findUnique({
      where: { userId_taxYear: { userId: h.session.userId, taxYear: h.session.taxYear } }
    });
    const parsed =
      row?.data && typeof row.data === "object"
        ? fiscalResidenceSchema.safeParse(row.data)
        : ({ success: false } as const);
    if (parsed.success) {
      assistantText =
        `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n` +
        buildAssistantMessageForExistingFiscalProfile({
          taxYear: h.session.taxYear,
          data: parsed.data,
          derivedProfile: row!.derivedProfile,
          requiresAdditionalReview: row!.requiresAdditionalReview
        });
    } else {
      assistantText = `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n${firstFiscalFieldPrompt()}`;
    }
  } else {
    assistantText = `Recorded focus: **${goal.replace(/_/g, " ")}**.\n\n${firstFiscalFieldPrompt()}`;
  }
  return { assistantText };
}
