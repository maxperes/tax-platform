import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../../db.js";
import {
  formatMonthlyTaxForRecap,
  isCapitalGainSkipIntent,
  isDomainStepSkipIntent,
  isEventsConfirmIntent,
  isMonthlyCalcConfirmIntent,
  loadIntakeModulePlan,
  nextStateAfterCapitalGain,
  nextStateAfterDeductions,
  nextStateAfterEntitySimulation,
  nextStateAfterEvents,
  nextStateAfterPatrimony,
  nextStateAfterTransfers,
  nextStateAfterTrustRegistry
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
      next === "deductions" ? "Capital gains are skipped for your intake focus.\n\n" : "";
    return {
      assistantText:
        `Thanks — that income classification looks right.\n\n${skipCgNote}` +
        intakeRedirectForState(next, h.ctx)
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
        `Noted — **no capital gains** this year.\n\n` + intakeRedirectForState(next, h.ctx)
    };
  }

  const domainSkipStates = ["patrimony", "transfers", "trust_registry", "entity_simulation"] as const;
  if ((domainSkipStates as readonly string[]).includes(state) && isDomainStepSkipIntent(h.userContent)) {
    const plan = await loadIntakeModulePlan(h.session.userId, h.session.taxYear, h.ctx);
    let next: ConversationState = "deductions";
    if (state === "patrimony") next = nextStateAfterPatrimony(plan);
    else if (state === "transfers") next = nextStateAfterTransfers(plan);
    else if (state === "trust_registry") next = nextStateAfterTrustRegistry(plan);
    else if (state === "entity_simulation") next = nextStateAfterEntitySimulation(plan);
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { state: next }
    });
    return {
      assistantText: `Noted — skipping this step.\n\n` + intakeRedirectForState(next, h.ctx)
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
