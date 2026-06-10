import type { ConversationState } from "@tax-platform/shared";
import { isTriagePending, triagePromptText } from "../../intake-helpers.js";
import { isHelpIntent } from "../intents.js";
import {
  fiscalProfileConfirmPromptText,
  getFiscalResidenceCurrentQuestion,
  isFiscalProfileConfirmPending
} from "../fiscal-orchestration.js";
import { incomeCheckpointMessage, intakeRedirectForState } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

const FIELD_FORMAT_HINTS: Record<string, string> = {
  currentResidenceCountry: "Reply with a country name or 2–3 letter code (e.g. **Brazil** or **BR**).",
  nationalityCountry: "Reply with a country name or 2–3 letter code (e.g. **United States** or **US**).",
  isFiscalResidentBrazil: "Reply **yes** or **no**.",
  isFiscalResidentUSA: "Reply **yes** or **no**.",
  fiscalResidenceOtherCountry: "Reply **yes** or **no**.",
  daysInBrazilCalendarYear: "Reply with a whole number from **0** to **366**.",
  daysInUSACalendarYear: "Reply with a whole number from **0** to **366**.",
  hasUSCitizenship: "Reply **yes** or **no**.",
  hasGreenCard: "Reply **yes** or **no**.",
  declaredPermanentExitBrazil: "Reply **yes** or **no**.",
  birthDate: "Reply with your date of birth as **YYYY-MM-DD** (e.g. 1990-05-15).",
  fullName: "Reply with your full legal name.",
  email: "Reply with a valid email address."
};

export async function handleHelp(h: HandlerContext): Promise<HandlerResult> {
  if (!isHelpIntent(h.userContent)) return null;

  const state = h.session.state as ConversationState;
  let body: string;

  if (state === "fiscal_residence") {
    if (isTriagePending(h.ctx)) {
      body = `**Help — choose your focus**\n\n${triagePromptText()}`;
    } else if (isFiscalProfileConfirmPending(h.ctx)) {
      body = `**Help — saved profile**\n\n${fiscalProfileConfirmPromptText()}`;
    } else if (h.ctx._usFilingPending === true) {
      body =
        "**Help — US filing status**\n\nReply with **single**, **mfj**, or **hoh**. Optional: FEIE and NII amounts on the same line.";
    } else {
      const question = getFiscalResidenceCurrentQuestion(h.ctx);
      const hintKey = (h.ctx._lastAskedKey as string | undefined) ?? "currentResidenceCountry";
      const formatHint = FIELD_FORMAT_HINTS[hintKey] ?? "Answer in plain text for the question below.";
      body = `**Help — fiscal profile**\n\n${formatHint}\n\n${question}`;
    }
  } else if (state === "income_capture") {
    const checkpoint = await incomeCheckpointMessage(h.session.userId, h.session.taxYear);
    body =
      `**Help — income**\n\n` +
      "Add lines like **`10900 USD 2026-01-31`** or **`5000 USD per month`**. " +
      "Open the **income table** below for structured entry. Say **that's all** when finished.\n\n" +
      checkpoint;
  } else if (state === "deductions") {
    body =
      `**Help — deductions**\n\n` +
      intakeRedirectForState("deductions", h.ctx) +
      "\n\nOpen the **deductions table** below, or say **no deductions** to skip.";
  } else {
    body =
      `**Help — step ${state.replace(/_/g, " ")}**\n\n` +
      intakeRedirectForState(state, h.ctx) +
      "\n\nSay **go back to income** (or another step) to edit earlier answers.";
  }

  return { assistantText: body };
}
