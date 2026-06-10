import { fiscalResidenceSchema } from "@tax-platform/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import { firstFiscalFieldPrompt } from "../../fiscal-intake.js";
import {
  completeFiscalProfileAndDetermineNext,
  isConfirmReplaceFiscalProfile,
  isConfirmUseStoredFiscalProfile,
  isFiscalProfileConfirmPending,
  stripFiscalProfileConfirmFlag
} from "../fiscal-orchestration.js";
import { postToolCallAssistantText } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";
import type { ConversationState } from "@tax-platform/shared";

export async function handleFiscalConfirm(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence" || !isFiscalProfileConfirmPending(h.ctx)) {
    return null;
  }

  const row = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: h.session.userId, taxYear: h.session.taxYear } }
  });
  const use = isConfirmUseStoredFiscalProfile(h.userContent);
  const replace = isConfirmReplaceFiscalProfile(h.userContent);

  let assistantText: string;

  if (!row?.data) {
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { contextJson: stripFiscalProfileConfirmFlag(h.ctx) as Prisma.InputJsonValue }
    });
    assistantText = `We couldn't load a saved fiscal profile for **${h.session.taxYear}** anymore. Let's start fresh.\n\n${firstFiscalFieldPrompt()}`;
  } else if (use && !replace) {
    const parsed = fiscalResidenceSchema.safeParse(row.data);
    if (!parsed.success) {
      await prisma.conversationSession.update({
        where: { id: h.sessionId },
        data: { contextJson: stripFiscalProfileConfirmFlag(h.ctx) as Prisma.InputJsonValue }
      });
      assistantText = `The saved profile could not be read anymore. Let's re-enter your details.\n\n${firstFiscalFieldPrompt()}`;
    } else {
      const confirmedCtx = {
        ...h.ctx,
        intakeGoal: h.ctx.intakeGoal ?? "full_annual",
        _triagePending: false
      };
      const result = await completeFiscalProfileAndDetermineNext(
        h.session.userId,
        h.session.taxYear,
        parsed.data,
        confirmedCtx
      );
      await prisma.conversationSession.update({
        where: { id: h.sessionId },
        data: {
          state: result.state,
          requiresAdditionalReview: result.requiresAdditionalReview,
          contextJson: result.context as Prisma.InputJsonValue
        }
      });
      assistantText = await postToolCallAssistantText(
        h.session.userId,
        "fiscal_residence",
        result.state,
        h.session.taxYear,
        result.context
      );
    }
  } else if (replace && !use) {
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { contextJson: stripFiscalProfileConfirmFlag(h.ctx) as Prisma.InputJsonValue }
    });
    assistantText =
      `Understood — we will re-enter your fiscal profile from scratch.\n\n${firstFiscalFieldPrompt()}`;
  } else {
    assistantText = `Please reply **yes** to keep the saved profile and continue, or **no** to replace it and start over.`;
  }

  return { assistantText };
}
