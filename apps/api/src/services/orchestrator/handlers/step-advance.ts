import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../../db.js";
import {
  formatMonthlyTaxForRecap,
  isCapitalGainSkipIntent,
  isEventsConfirmIntent,
  isMonthlyCalcConfirmIntent,
  loadIntakeModulePlan,
  nextStateAfterCapitalGain,
  nextStateAfterDeductions,
  nextStateAfterEvents
} from "../../intake-helpers.js";
import {
  isDeductionsSkipIntent,
  isShortAffirmativeAdvance,
  lastAssistantAskedProceed,
  lastAssistantContent
} from "../intents.js";
import { intakeRedirectForState } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleStepAdvance(h: HandlerContext): Promise<HandlerResult> {
  const state = h.session.state as ConversationState;

  if (state === "events" && isEventsConfirmIntent(h.userContent)) {
    const plan = await loadIntakeModulePlan(h.session.userId, h.session.taxYear, h.ctx);
    const next = nextStateAfterEvents(plan);
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { state: next }
    });
    const skipCgNote =
      next === "deductions" ? " Capital gains are skipped for your intake focus.\n\n" : "";
    return {
      assistantText:
        `Thanks — **derived taxable events** confirmed.${skipCgNote}` + intakeRedirectForState(next, h.ctx)
    };
  }

  if (state === "capital_gain" && isCapitalGainSkipIntent(h.userContent)) {
    const plan = await loadIntakeModulePlan(h.session.userId, h.session.taxYear, h.ctx);
    const next = nextStateAfterCapitalGain(plan);
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { state: next }
    });
    return {
      assistantText:
        `Noted — **no capital gains** this year.\n\n` + intakeRedirectForState("deductions", h.ctx)
    };
  }

  if (state === "deductions") {
    const priorAssistant = lastAssistantContent(h.messages);
    const askedProceed = lastAssistantAskedProceed(priorAssistant);
    const skipDeductions = isDeductionsSkipIntent(h.userContent);
    const affirmProceed = isShortAffirmativeAdvance(h.userContent) && askedProceed;
    if (skipDeductions || affirmProceed) {
      const plan = await loadIntakeModulePlan(h.session.userId, h.session.taxYear, h.ctx);
      const next = nextStateAfterDeductions(plan);
      await prisma.conversationSession.update({
        where: { id: h.sessionId },
        data: { state: next }
      });
      const lead = skipDeductions
        ? "Noted — we will treat **deductions** as none for this pass."
        : "Great — moving on.";
      const tail =
        next === "report"
          ? intakeRedirectForState("report", h.ctx)
          : await formatMonthlyTaxForRecap(h.session.userId, h.session.taxYear);
      return { assistantText: `${lead}\n\n${tail}` };
    }
  }

  if (state === "monthly_calc" && isMonthlyCalcConfirmIntent(h.userContent)) {
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { state: "report" }
    });
    return {
      assistantText:
        "Thanks — **monthly totals** confirmed.\n\n" + intakeRedirectForState("report", h.ctx)
    };
  }

  return null;
}
