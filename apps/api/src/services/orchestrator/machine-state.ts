import { CONVERSATION_STATES, type ConversationState } from "@tax-platform/shared";
import type { IntakeModulePlan } from "../intake-helpers.js";
import {
  getActiveFiscalFieldOrder,
  getNextFiscalField,
  isValidFiscalFieldValue
} from "../fiscal-intake.js";

/** Bump when intake policy text or machine-state shape changes. */
export const INTAKE_PROMPT_VERSION = "intake-assistant@v1";

export type LlmToolName =
  | "submit_fiscal_residence"
  | "submit_income_source"
  | "submit_deduction"
  | "submit_capital_gain"
  | "mark_complex_case"
  | "request_clarification"
  | "advance_conversation_state";

export type IntakeMachineState = {
  promptVersion: string;
  state: ConversationState;
  taxYear: number;
  knownAnswers: Record<string, unknown>;
  nextField: { key: string; questionHint: string } | null;
  missingFields: string[];
  allowedTools: LlmToolName[];
  modulePlan?: {
    profile: string;
    skipMonthly: boolean;
    needsCarnetLeao: boolean;
    intakeGoal?: string;
  };
  hints: string[];
};

const ADVANCE_AND_CLARIFY: LlmToolName[] = [
  "advance_conversation_state",
  "request_clarification",
  "mark_complex_case"
];

export function allowedToolsForState(state: ConversationState): LlmToolName[] {
  switch (state) {
    case "fiscal_residence":
      return ["submit_fiscal_residence", ...ADVANCE_AND_CLARIFY];
    case "income_capture":
      return ["submit_income_source", ...ADVANCE_AND_CLARIFY];
    case "capital_gain":
      return ["submit_capital_gain", ...ADVANCE_AND_CLARIFY];
    case "deductions":
      return ["submit_deduction", ...ADVANCE_AND_CLARIFY];
    case "events":
    case "patrimony":
    case "transfers":
    case "trust_registry":
    case "entity_simulation":
    case "monthly_calc":
    case "report":
    case "complete":
      return [...ADVANCE_AND_CLARIFY];
  }
}

function extractKnownAnswers(
  state: ConversationState,
  context: Record<string, unknown>
): Record<string, unknown> {
  const known: Record<string, unknown> = {};
  if (typeof context.intakeGoal === "string") known.intakeGoal = context.intakeGoal;
  if (typeof context.primaryCurrency === "string") known.primaryCurrency = context.primaryCurrency;
  if (Array.isArray(context.assetTypes)) known.assetTypes = context.assetTypes;

  if (state === "fiscal_residence") {
    for (const { key } of getActiveFiscalFieldOrder(context)) {
      if (isValidFiscalFieldValue(key, context[key])) {
        known[key] = context[key];
      }
    }
  } else {
    for (const [key, value] of Object.entries(context)) {
      if (key.startsWith("_")) continue;
      if (value === undefined || value === null || value === "") continue;
      if (typeof value === "object" && !Array.isArray(value)) continue;
      known[key] = value;
    }
  }
  return known;
}

function missingFieldsForState(
  state: ConversationState,
  context: Record<string, unknown>
): string[] {
  if (state !== "fiscal_residence") return [];
  return getActiveFiscalFieldOrder(context)
    .filter((f) => !isValidFiscalFieldValue(f.key, context[f.key]))
    .map((f) => f.key);
}

function hintsForState(state: ConversationState, taxYear: number): string[] {
  const hints: string[] = [
    "Ask one short question at a time.",
    "Never compute or guarantee final tax outcomes.",
    "When moving workflow steps, call advance_conversation_state in the same turn."
  ];
  if (state === "fiscal_residence") {
    hints.push(
      "After each user reply call submit_fiscal_residence with every knownAnswers field plus the latest answer.",
      "Do not ask for CPF, SSN, street address, or email.",
      "immigrationStatus is a category (tourist, temporary_visa, digital_nomad, work_visa, retirement_visa, family_reunion, permanent, citizen, none)."
    );
  }
  if (state === "income_capture") {
    hints.push(
      "Collect the same facts as the structured interview: income categories, approximate annual amount, currency, origin country, withholding, and a payment date when known.",
      `paymentDate must be YYYY-MM-DD in ${taxYear} when representative.`,
      'If the user is done listing income, advance to "events" after the asset-category screen.'
    );
  }
  if (state === "events") {
    hints.push("Taxable events are derived from income — confirm the table, then advance.");
  }
  if (state === "monthly_calc") {
    hints.push("Carnê-Leão totals are pre-computed — review the month table, then advance to report.");
  }
  if (state === "capital_gain") {
    hints.push(
      "Ask whether they sold stocks, a home, crypto, or a company share this year.",
      "Give one short example of a sale. If they sold nothing, they can say none and you advance to patrimony."
    );
  }
  if (
    state === "patrimony" ||
    state === "transfers" ||
    state === "trust_registry" ||
    state === "entity_simulation"
  ) {
    hints.push(
      "If the user has nothing to add, advance in order: patrimony → transfers → trust_registry → entity_simulation → deductions."
    );
  }
  return hints;
}

export function buildIntakeMachineState(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  modulePlan?: IntakeModulePlan
): IntakeMachineState {
  const next = state === "fiscal_residence" ? getNextFiscalField(context) : null;
  return {
    promptVersion: INTAKE_PROMPT_VERSION,
    state,
    taxYear,
    knownAnswers: extractKnownAnswers(state, context),
    nextField: next ? { key: next.key, questionHint: next.prompt } : null,
    missingFields: missingFieldsForState(state, context),
    allowedTools: allowedToolsForState(state),
    modulePlan: modulePlan
      ? {
          profile: String(modulePlan.derivedProfile),
          skipMonthly: modulePlan.skipMonthly,
          needsCarnetLeao: modulePlan.needsCarnetLeao,
          intakeGoal: modulePlan.intakeGoal
        }
      : undefined,
    hints: hintsForState(state, taxYear)
  };
}

/** Valid forward targets for advance_conversation_state. */
export const ADVANCE_STATE_ENUM = CONVERSATION_STATES;
