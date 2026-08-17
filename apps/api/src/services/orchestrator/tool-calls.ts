import {
  fiscalResidenceSchema,
  incomeSourceSchema,
  deductionSchema,
  capitalGainCalculationSchema,
  type ConversationState
} from "@tax-platform/shared";
import type { Prisma } from "../../prisma-client.js";
import type OpenAI from "openai";
import type { ZodError } from "zod";
import { prisma } from "../../db.js";
import { normalizeForwardAdvance } from "../conversation-state-heal.js";
import { createClassifiedIncome } from "../persistence/income.js";
import { createDeduction } from "../persistence/deduction.js";
import { createCapitalGainCalculation } from "../persistence/capital-gain.js";
import {
  applyProfileAwareAdvance,
  loadIntakeModulePlan
} from "../intake-helpers.js";
import {
  getActiveFiscalFieldOrder,
  isValidFiscalFieldValue,
  prepareFiscalPayloadForValidation
} from "../fiscal-intake.js";
import {
  completeFiscalProfileAndDetermineNext,
  expandFiscalResidenceToolPayload,
  getFiscalResidenceMergedFields
} from "./fiscal-orchestration.js";
import { getContext } from "./session-context.js";
import { ASSET_SCREEN_PENDING_KEY } from "./handlers/asset-screen.js";

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

function formatZodError(err: ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export type ToolCallOutcome = {
  toolCallId: string;
  name: string;
  ok: boolean;
  error?: string;
  detail?: string;
  clarificationQuestion?: string;
};

export type ApplyToolCallsResult = {
  incomeRowsSaved: number;
  outcomes: ToolCallOutcome[];
  clarificationQuestion: string | null;
};

function outcomePayload(o: ToolCallOutcome): string {
  return JSON.stringify({
    ok: o.ok,
    name: o.name,
    ...(o.error ? { error: o.error } : {}),
    ...(o.detail ? { detail: o.detail } : {}),
    ...(o.clarificationQuestion ? { clarificationQuestion: o.clarificationQuestion } : {})
  });
}

export function toolResultsForRecovery(
  outcomes: ToolCallOutcome[]
): { toolCallId: string; content: string }[] {
  return outcomes.map((o) => ({
    toolCallId: o.toolCallId,
    content: outcomePayload(o)
  }));
}

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
  const outcomes: ToolCallOutcome[] = [];
  let clarificationQuestion: string | null = null;

  for (const call of toolCalls) {
    if (call.type !== "function") continue;
    const toolCallId = call.id;
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      outcomes.push({
        toolCallId,
        name,
        ok: false,
        error: "Invalid JSON in tool arguments"
      });
      continue;
    }

    if (name === "submit_fiscal_residence") {
      const data = (args.data ?? {}) as Record<string, unknown>;
      const flat = expandFiscalResidenceToolPayload(data);
      context = { ...context, ...flat };
      const asked = getFiscalResidenceMergedFields(context);
      const mapQuestionsOpen = getActiveFiscalFieldOrder(asked).some(
        (field) => !isValidFiscalFieldValue(field.key, asked[field.key])
      );
      if (!mapQuestionsOpen) {
        const merged = prepareFiscalPayloadForValidation(asked);
        if (typeof merged.email !== "string" || !merged.email) {
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
          if (user?.email) merged.email = user.email;
        }
        const parsed = fiscalResidenceSchema.safeParse(merged);
        if (parsed.success) {
          const result = await completeFiscalProfileAndDetermineNext(userId, taxYear, parsed.data, context);
          state = result.state;
          context = result.context;
          requiresReview = result.requiresAdditionalReview;
          outcomes.push({ toolCallId, name, ok: true, detail: "profile_completed" });
        } else {
          outcomes.push({
            toolCallId,
            name,
            ok: false,
            error: formatZodError(parsed.error),
            detail: "partial_fields_kept"
          });
        }
      } else {
        outcomes.push({ toolCallId, name, ok: true, detail: "partial_saved" });
      }
      continue;
    }

    if (name === "submit_income_source") {
      const raw = toolNestedOrFlatArgs(args, "income", (a) => {
        return (
          typeof a.grossAmount === "number" ||
          typeof a.paymentDate === "string" ||
          typeof a.payerName === "string"
        );
      });
      if (!raw) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: "Missing income object (expected nested `income` or flat income fields)"
        });
        continue;
      }
      const parsedIncome = incomeSourceSchema.safeParse(raw);
      if (!parsedIncome.success) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: formatZodError(parsedIncome.error)
        });
        continue;
      }
      await createClassifiedIncome(userId, taxYear, parsedIncome.data);
      incomeRowsSaved += 1;
      outcomes.push({ toolCallId, name, ok: true, detail: "income_saved" });
      continue;
    }

    if (name === "submit_deduction") {
      const raw = toolNestedOrFlatArgs(args, "deduction", (a) => {
        return typeof a.deductionType === "string" || typeof a.amount === "number";
      });
      if (!raw) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: "Missing deduction object"
        });
        continue;
      }
      const parsedDeduction = deductionSchema.safeParse(raw);
      if (!parsedDeduction.success) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: formatZodError(parsedDeduction.error)
        });
        continue;
      }
      const created = await createDeduction(userId, taxYear, parsedDeduction.data);
      if (!created.ok) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: created.errors.join("; ")
        });
        continue;
      }
      outcomes.push({ toolCallId, name, ok: true, detail: "deduction_saved" });
      continue;
    }

    if (name === "submit_capital_gain") {
      const raw = toolNestedOrFlatArgs(args, "capitalGain", (a) => {
        return typeof a.assetType === "string" || typeof a.saleDate === "string";
      });
      if (!raw) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: "Missing capitalGain object"
        });
        continue;
      }
      const parsedCg = capitalGainCalculationSchema.safeParse(raw);
      if (!parsedCg.success) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: formatZodError(parsedCg.error)
        });
        continue;
      }
      await createCapitalGainCalculation(userId, taxYear, parsedCg.data);
      outcomes.push({ toolCallId, name, ok: true, detail: "capital_gain_saved" });
      continue;
    }

    if (name === "mark_complex_case") {
      requiresReview = true;
      outcomes.push({ toolCallId, name, ok: true, detail: "marked_for_review" });
      continue;
    }

    if (name === "request_clarification") {
      const question = typeof args.question === "string" ? args.question.trim() : "";
      if (!question) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: "question is required"
        });
        continue;
      }
      clarificationQuestion = question;
      outcomes.push({
        toolCallId,
        name,
        ok: true,
        clarificationQuestion: question,
        detail: "clarification_queued"
      });
      continue;
    }

    if (name === "advance_conversation_state") {
      const from = state;
      const rawNext = normalizeForwardAdvance(state as ConversationState, args.nextState);
      if (!rawNext) {
        outcomes.push({
          toolCallId,
          name,
          ok: false,
          error: `Invalid or backward advance to ${String(args.nextState)} from ${state}`
        });
        continue;
      }
      if (from === "fiscal_residence") {
        const asked = getFiscalResidenceMergedFields(context);
        const missing = getActiveFiscalFieldOrder(asked)
          .filter((field) => !isValidFiscalFieldValue(field.key, asked[field.key]))
          .map((field) => field.key);
        if (missing.length > 0) {
          outcomes.push({
            toolCallId,
            name,
            ok: false,
            error: `Cannot leave fiscal_residence while fields are missing: ${missing.join(", ")}`
          });
          continue;
        }
      }
      const plan = await loadIntakeModulePlan(userId, taxYear, context);
      state = applyProfileAwareAdvance(state as ConversationState, rawNext, plan);
      if (
        from === "income_capture" &&
        state === "events" &&
        !Array.isArray(context.assetTypes)
      ) {
        context = { ...context, [ASSET_SCREEN_PENDING_KEY]: true };
        state = "income_capture";
      }
      outcomes.push({
        toolCallId,
        name,
        ok: true,
        detail: `advanced_to_${state}`
      });
      continue;
    }

    outcomes.push({
      toolCallId,
      name,
      ok: false,
      error: `Unknown tool: ${name}`
    });
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      contextJson: context as Prisma.InputJsonValue,
      state,
      requiresAdditionalReview: requiresReview
    }
  });
  return { incomeRowsSaved, outcomes, clarificationQuestion };
}

export function hadFiscalResidenceToolCall(toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[]): boolean {
  return toolCalls.some(
    (c) => c.type === "function" && c.function.name === "submit_fiscal_residence"
  );
}

export function hadFailedToolOutcomes(outcomes: ToolCallOutcome[]): boolean {
  return outcomes.some((o) => !o.ok);
}
