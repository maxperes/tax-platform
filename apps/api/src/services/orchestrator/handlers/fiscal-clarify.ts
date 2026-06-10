import type { ConversationState } from "@tax-platform/shared";
import { getActiveFiscalFieldOrder, isValidFiscalFieldValue } from "../../fiscal-intake.js";
import { isTriagePending } from "../../intake-helpers.js";
import { isFiscalClarificationQuestion } from "../intents.js";
import {
  getFiscalResidenceMergedFields,
  getFiscalResidenceCurrentQuestion,
  isFiscalProfileConfirmPending
} from "../fiscal-orchestration.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

const FIELD_FAQ: Record<string, string> = {
  currentResidenceCountry:
    "We need your country of residence to apply the right tax rules. You can reply with the full name (**Brazil**) or ISO code (**BR**).",
  nationalityCountry:
    "Nationality helps determine filing obligations (e.g. US citizens). Reply with a country name or code like **BR** or **US**.",
  isFiscalResidentBrazil:
    "A **fiscal resident** of Brazil generally files IRPF and may owe Carnê-Leão on foreign income. Reply **yes** or **no**.",
  isFiscalResidentUSA:
    "US fiscal residence usually means you file a US return. Reply **yes** or **no**.",
  fiscalResidenceOtherCountry:
    "If you are also resident elsewhere, we flag the case for review. Reply **yes** or **no**.",
  birthDate: "Your birth date is required on tax forms. Use format **YYYY-MM-DD**.",
  fullName: "Use your name as it appears on official documents.",
  email: "We use this for account notifications only."
};

export async function handleFiscalClarify(h: HandlerContext): Promise<HandlerResult> {
  if ((h.session.state as ConversationState) !== "fiscal_residence") return null;
  if (isTriagePending(h.ctx) || isFiscalProfileConfirmPending(h.ctx)) return null;
  if (h.ctx._usFilingPending === true) return null;
  if (!isFiscalClarificationQuestion(h.userContent)) return null;

  const merged = getFiscalResidenceMergedFields(h.ctx);
  const expectedKey = getActiveFiscalFieldOrder(merged).find(
    (f) => !isValidFiscalFieldValue(f.key, merged[f.key])
  )?.key;
  const faq = expectedKey ? FIELD_FAQ[expectedKey] : undefined;
  const question = getFiscalResidenceCurrentQuestion(h.ctx);

  const assistantText = faq
    ? `${faq}\n\n${question}`
    : `I'll keep this focused on your intake.\n\n${question}`;

  return { assistantText };
}
