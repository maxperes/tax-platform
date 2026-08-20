import type { ConversationState } from "@tax-platform/shared";
import { isTriagePending } from "../../intake-helpers.js";
import { isFiscalClarificationQuestion, lastAssistantContent } from "../intents.js";
import {
  getFiscalPromptForAskedField,
  isFiscalProfileConfirmPending,
  resolveFiscalFieldBeingAsked
} from "../fiscal-orchestration.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

const FIELD_FAQ: Record<string, string> = {
  currentResidenceCountry:
    "We need your country of residence to apply the right tax rules. You can reply with the full name (**Brazil**) or ISO code (**BR**).",
  nationalityCountry:
    "Nationality helps determine filing obligations (e.g. US citizens). Reply with a country name or code like **BR** or **US**.",
  physicallyLivesInBrazil: "Whether you are in Brazil now is a presence fact for residency. Reply **yes** or **no**.",
  brazilStaysText:
    "Record Brazil entry and exit dates — the system counts days for the 183-day test. One stay per line: **ENTRY YYYY-MM-DD, EXIT YYYY-MM-DD** (use **ongoing** if still in Brazil).",
  isFiscalResidentBrazil:
    "A **fiscal resident** of Brazil generally files IRPF and may owe Carnê-Leão on foreign income. Reply **yes** or **no**.",
  isFiscalResidentUSA:
    "US fiscal residence usually means you file a US return. Reply **yes** or **no**.",
  fiscalResidenceOtherCountry:
    "If you are also resident elsewhere, we flag the case for review. Reply **yes** or **no**.",
  immigrationStatus:
    "This is your **Brazilian immigration category**, not a yes/no. Reply **1–9** (tourist, temporary visa, digital nomad, work visa, retirement visa, family reunion, permanent, citizen, or none), or **not sure**.",
  hasCpf:
    "We only need to know whether you have a CPF — never send the number. Reply **yes** or **no**.",
  hasResidencePermit:
    "A residence permit is a signal for Brazilian tax residency. Reply **yes**, **no**, or **not sure**.",
  lastFilingCountry:
    "Last year's filing country is a clue for which rules apply. Reply with a country, **none**, or **not sure**.",
  filedBrazilianReturn:
    "Prior Brazilian filings affect what we expect this year. Reply **yes**, **no**, or **not sure**.",
  declaredPermanentExitBrazil:
    "A saída definitiva (departure declaration) changes non-resident treatment. Reply **yes**, **no**, or **not applicable**.",
  maritalStatus:
    "Marital status can affect filing and dependents. Reply **1–5** (single, married, stable union, divorced, widowed), or **not sure**.",
  dependentsCount: "Dependents can affect deductions and filing. Reply with a whole number (**0** or more).",
  daysInUSACalendarYear:
    "US days of presence feed the substantial-presence test. Reply **0–366** or **not sure**.",
  hasUSCitizenship: "US citizenship generally means a US filing obligation. Reply **yes** or **no**.",
  hasGreenCard: "A green card generally means US tax residence. Reply **yes** or **no**.",
  birthDate: "Your birth date is required on tax forms. Reply **YYYY-MM-DD** (e.g. **1988-01-01**) or a slash date like **01/01/1988**.",
  fullName: "Use your name as it appears on official documents.",
  email: "We use this for account notifications only."
};

export function buildFiscalClarifyReply(
  context: Record<string, unknown>,
  lastAssistantText?: string
): string {
  const key = resolveFiscalFieldBeingAsked(context, lastAssistantText);
  const faq = key ? FIELD_FAQ[key] : undefined;
  const question = getFiscalPromptForAskedField(context, lastAssistantText);
  if (faq) return `${faq}\n\n${question}`;
  return `This answer feeds your 360° tax map.\n\n${question}`;
}

export async function handleFiscalClarify(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence") return null;
  if (isTriagePending(h.ctx) || isFiscalProfileConfirmPending(h.ctx)) return null;
  if (h.ctx._usFilingPending === true) return null;
  if (!isFiscalClarificationQuestion(h.userContent)) return null;

  return {
    assistantText: buildFiscalClarifyReply(h.ctx, lastAssistantContent(h.messages))
  };
}
