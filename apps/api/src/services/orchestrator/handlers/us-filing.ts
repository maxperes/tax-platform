import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db.js";
import { isTriagePending, isUsFilingPending, loadIntakeModulePlan, parseUsFilingInputs } from "../../intake-helpers.js";
import { isFiscalProfileConfirmPending } from "../fiscal-orchestration.js";
import { resolveIntakeRedirect } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";
import type { ConversationState } from "@tax-platform/shared";

export async function handleUsFiling(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence") return null;
  if (isTriagePending(h.ctx) || isFiscalProfileConfirmPending(h.ctx)) return null;

  const plan = await loadIntakeModulePlan(h.session.userId, h.session.taxYear, h.ctx);
  if (!isUsFilingPending(h.ctx, plan)) return null;

  const usInputs = parseUsFilingInputs(h.userContent);
  if (!usInputs) return null;

  const newCtx = { ...h.ctx, usFilingInputs: usInputs, _usFilingPending: false };
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: {
      state: "income_capture",
      contextJson: newCtx as Prisma.InputJsonValue
    }
  });

  const assistantText =
    `Saved US filing status: **${usInputs.filingStatus.replace(/_/g, " ")}**.\n\n` +
    (await resolveIntakeRedirect("income_capture", newCtx, h.session.userId, h.session.taxYear));
  return { assistantText };
}
