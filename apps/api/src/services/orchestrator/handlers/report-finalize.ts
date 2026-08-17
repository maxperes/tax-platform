import type { ConversationState } from "@tax-platform/shared";
import { prisma } from "../../../db.js";
import {
  isProceedAnywayIntent,
  resolveIncomeGaps,
  specialistHandoffBlock
} from "../../intake-helpers.js";
import {
  assistantAcknowledgesNoTaxableEvents,
  isExplicitGenerateReportIntent,
  lastAssistantOfferedSummary
} from "../../summary-offer.js";
import { isShortAffirmativeAdvance, lastAssistantContent } from "../intents.js";
import { intakeRedirectForState } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";
import { enqueueAndWait, JOB_NAMES } from "../../jobs/queue.js";

const SUMMARY_YES_STATES: ConversationState[] = [
  "events",
  "deductions",
  "capital_gain",
  "monthly_calc",
  "report",
  "complete"
];

const PROCEED_ANYWAY_STATES: ConversationState[] = [
  "events",
  "deductions",
  "capital_gain",
  "monthly_calc",
  "report",
  "complete"
];

async function finalizeReportAndComplete(
  h: HandlerContext
): Promise<string> {
  await enqueueAndWait(JOB_NAMES.buildReport, {
    userId: h.session.userId,
    taxYear: h.session.taxYear
  });
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: { state: "complete" }
  });
  return (
    `Your tax report for **${h.session.taxYear}** is ready. Open **View filing report** in the header (or download JSON there).\n\n` +
    intakeRedirectForState("complete", h.ctx)
  );
}

export async function handleReportFinalize(h: HandlerContext): Promise<HandlerResult> {
  const stForSummary = h.session.state as ConversationState;

  if (
    isProceedAnywayIntent(h.userContent) &&
    PROCEED_ANYWAY_STATES.includes(stForSummary)
  ) {
    return { assistantText: await finalizeReportAndComplete(h) };
  }

  const explicitReportCmd = isExplicitGenerateReportIntent(h.userContent);

  if (!SUMMARY_YES_STATES.includes(stForSummary) && !explicitReportCmd) return null;

  const priorForSummary = lastAssistantContent(h.messages);
  const summaryConversationYes =
    SUMMARY_YES_STATES.includes(stForSummary) &&
    isShortAffirmativeAdvance(h.userContent) &&
    lastAssistantOfferedSummary(priorForSummary) &&
    (stForSummary !== "events" || assistantAcknowledgesNoTaxableEvents(priorForSummary));

  if (!explicitReportCmd && !summaryConversationYes) return null;

  const gaps = await resolveIncomeGaps(h.session.userId, h.session.taxYear);
  const fpRow = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: h.session.userId, taxYear: h.session.taxYear } }
  });
  const needsHandoff =
    h.session.requiresAdditionalReview ||
    (fpRow?.requiresAdditionalReview ?? false) ||
    gaps.gaps.length > 0;

  if (needsHandoff && !isProceedAnywayIntent(h.userContent) && !explicitReportCmd) {
    return {
      assistantText:
        specialistHandoffBlock(
          h.session.requiresAdditionalReview || (fpRow?.requiresAdditionalReview ?? false),
          gaps.summaryText
        ) + intakeRedirectForState(stForSummary, h.ctx)
    };
  }

  return { assistantText: await finalizeReportAndComplete(h) };
}
