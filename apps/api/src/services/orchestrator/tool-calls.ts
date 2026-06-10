import {
  fiscalResidenceSchema,
  incomeSourceSchema,
  deductionSchema,
  capitalGainCalculationSchema,
  type ConversationState
} from "@tax-platform/shared";
import type { Prisma } from "@prisma/client";
import type OpenAI from "openai";
import { prisma } from "../../db.js";
import { normalizeForwardAdvance } from "../conversation-state-heal.js";
import { createClassifiedIncome } from "../persistence/income.js";
import { createDeduction } from "../persistence/deduction.js";
import { createCapitalGainCalculation } from "../persistence/capital-gain.js";
import {
  applyProfileAwareAdvance,
  loadIntakeModulePlan
} from "../intake-helpers.js";
import { prepareFiscalPayloadForValidation } from "../fiscal-intake.js";
import {
  completeFiscalProfileAndDetermineNext,
  expandFiscalResidenceToolPayload,
  getFiscalResidenceMergedFields
} from "./fiscal-orchestration.js";
import { getContext } from "./session-context.js";

/** OpenAI tool args sometimes omit the nested wrapper; accept root-level fields when they clearly match the payload. */
function toolNestedOrFlatArgs(
  args: Record<string, unknown>,
  nestedKey: string,
  looksLikePayload: (a: Record<string, unknown>) => boolean
): Record<string, unknown> | undefined {
  const nested = args[nestedKey];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  if (looksLikePayload(args)) return args;
  return undefined;
}

export type ApplyToolCallsResult = { incomeRowsSaved: number };

export async function applyToolCalls(
  userId: string,
  taxYear: number,
  sessionId: string,
  toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  session: { state: string; contextJson: Prisma.JsonValue | null }
): Promise<ApplyToolCallsResult> {
  let context = getContext(session);
  let state = session.state as ConversationState;
  let requiresReview = false;
  let incomeRowsSaved = 0;

  for (const call of toolCalls) {
    if (call.type !== "function") continue;
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }

    if (name === "submit_fiscal_residence") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      const flat = expandFiscalResidenceToolPayload(data);
      context = { ...context, ...flat };
      const merged = prepareFiscalPayloadForValidation(getFiscalResidenceMergedFields(context));
      const parsed = fiscalResidenceSchema.safeParse(merged);
      if (parsed.success) {
        const result = await completeFiscalProfileAndDetermineNext(userId, taxYear, parsed.data, context);
        state = result.state;
        context = result.context;
        requiresReview = result.requiresAdditionalReview;
      }
    }

    if (name === "submit_income_source") {
      const raw = toolNestedOrFlatArgs(args, "income", (a) => {
        return (
          typeof a.grossAmount === "number" ||
          typeof a.paymentDate === "string" ||
          typeof a.payerName === "string"
        );
      });
      if (!raw) continue;
      const parsedIncome = incomeSourceSchema.safeParse(raw);
      if (!parsedIncome.success) continue;
      await createClassifiedIncome(userId, taxYear, parsedIncome.data);
      incomeRowsSaved += 1;
    }

    if (name === "submit_deduction") {
      const raw = toolNestedOrFlatArgs(args, "deduction", (a) => {
        return typeof a.deductionType === "string" || typeof a.amount === "number";
      });
      if (!raw) continue;
      const parsedDeduction = deductionSchema.safeParse(raw);
      if (!parsedDeduction.success) continue;
      const created = await createDeduction(userId, taxYear, parsedDeduction.data);
      if (!created.ok) continue;
    }

    if (name === "submit_capital_gain") {
      const raw = toolNestedOrFlatArgs(args, "capitalGain", (a) => {
        return typeof a.assetType === "string" || typeof a.saleDate === "string";
      });
      if (!raw) continue;
      const parsedCg = capitalGainCalculationSchema.safeParse(raw);
      if (!parsedCg.success) continue;
      await createCapitalGainCalculation(userId, taxYear, parsedCg.data);
    }

    if (name === "mark_complex_case") {
      requiresReview = true;
    }

    if (name === "advance_conversation_state") {
      const rawNext = normalizeForwardAdvance(state as ConversationState, args.nextState);
      if (rawNext) {
        const plan = await loadIntakeModulePlan(userId, taxYear, context);
        state = applyProfileAwareAdvance(state as ConversationState, rawNext, plan);
      }
    }
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      contextJson: context as Prisma.InputJsonValue,
      state,
      requiresAdditionalReview: requiresReview
    }
  });
  return { incomeRowsSaved };
}

export function hadFiscalResidenceToolCall(toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[]): boolean {
  return toolCalls.some(
    (c) => c.type === "function" && c.function.name === "submit_fiscal_residence"
  );
}
