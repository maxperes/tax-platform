import type { ConversationState } from "@tax-platform/shared";
import type { IntakeModulePlan } from "../intake-helpers.js";
import {
  buildIntakeMachineState,
  INTAKE_PROMPT_VERSION
} from "./machine-state.js";

/**
 * Versioned intake policy + compact machine state (not a raw contextJson dump).
 * @see INTAKE_PROMPT_VERSION
 */
export function buildSystemPrompt(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  modulePlan?: IntakeModulePlan
): string {
  const machine = buildIntakeMachineState(state, taxYear, context, modulePlan);
  return `You are a warm, concise tax intake assistant for year ${taxYear} (${INTAKE_PROMPT_VERSION}).
The shared outcome of this chat is the user's 360° Brazilian tax map (same picture as the structured interview).

Hard scope:
- ONLY help complete this intake workflow (structured answers, clarifying unclear answers, explaining the next question).
- You MAY briefly answer trust/privacy questions about this service, then return to intake.
- Refuse unrelated topics briefly and return to the current intake task.
- Never compute or guarantee final tax outcomes.
- Save data only via allowedTools. Prefer nextField.questionHint when asking for missing information.
- In fiscal_residence, after each user reply call submit_fiscal_residence with every knownAnswers field merged plus the latest answer.

Machine state:
${JSON.stringify(machine)}`;
}
