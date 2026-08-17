import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { Prisma } from "../../prisma-client.js";

const prismaMock = vi.hoisted(() => ({
  conversationSession: {
    update: vi.fn(async () => ({}))
  },
  user: {
    findUnique: vi.fn(async () => ({ email: "u@example.com" }))
  }
}));

vi.mock("../../db.js", () => ({ prisma: prismaMock }));

vi.mock("../persistence/income.js", () => ({
  createClassifiedIncome: vi.fn(async () => ({ id: "inc-1" }))
}));

vi.mock("../persistence/deduction.js", () => ({
  createDeduction: vi.fn(async () => ({ ok: true, row: { id: "ded-1" } }))
}));

vi.mock("../persistence/capital-gain.js", () => ({
  createCapitalGainCalculation: vi.fn(async () => ({ id: "cg-1" }))
}));

vi.mock("../intake-helpers.js", () => ({
  loadIntakeModulePlan: vi.fn(async () => ({
    derivedProfile: "resident_brazil",
    needsCarnetLeao: true,
    needsCapitalGainStep: true,
    needsUsAnnual: false,
    skipMonthly: false
  })),
  applyProfileAwareAdvance: vi.fn((_from: string, next: string) => next)
}));

import { applyToolCalls, hadFailedToolOutcomes, toolResultsForRecovery } from "./tool-calls.js";
import { createClassifiedIncome } from "../persistence/income.js";

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>
): OpenAI.Chat.ChatCompletionMessageToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) }
  };
}

describe("applyToolCalls outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records Zod errors instead of silently skipping income", async () => {
    const result = await applyToolCalls(
      "user-1",
      2026,
      "sess-1",
      [
        toolCall("call-1", "submit_income_source", {
          income: { payerName: "Acme", grossAmount: 100 }
        })
      ],
      { state: "income_capture", contextJson: {} as Prisma.JsonValue }
    );

    expect(result.incomeRowsSaved).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]).toMatchObject({ ok: false, name: "submit_income_source" });
    expect(result.outcomes[0]?.error).toMatch(/required|Invalid|expected/i);
    expect(hadFailedToolOutcomes(result.outcomes)).toBe(true);
    expect(createClassifiedIncome).not.toHaveBeenCalled();
    expect(toolResultsForRecovery(result.outcomes)[0]?.content).toContain('"ok":false');
  });

  it("wires request_clarification into the result", async () => {
    const result = await applyToolCalls(
      "user-1",
      2026,
      "sess-1",
      [toolCall("call-2", "request_clarification", { question: "Was that monthly or annual?" })],
      { state: "income_capture", contextJson: {} as Prisma.JsonValue }
    );

    expect(result.clarificationQuestion).toBe("Was that monthly or annual?");
    expect(result.outcomes[0]).toMatchObject({ ok: true, detail: "clarification_queued" });
    expect(hadFailedToolOutcomes(result.outcomes)).toBe(false);
  });

  it("records invalid JSON args as failures", async () => {
    const result = await applyToolCalls(
      "user-1",
      2026,
      "sess-1",
      [
        {
          id: "call-3",
          type: "function",
          function: { name: "submit_income_source", arguments: "{not-json" }
        }
      ],
      { state: "income_capture", contextJson: {} as Prisma.JsonValue }
    );

    expect(result.outcomes[0]).toMatchObject({
      ok: false,
      error: "Invalid JSON in tool arguments"
    });
  });

  it("rejects advance out of fiscal_residence while fields are missing", async () => {
    const result = await applyToolCalls(
      "user-1",
      2026,
      "sess-1",
      [toolCall("call-4", "advance_conversation_state", { nextState: "income_capture" })],
      {
        state: "fiscal_residence",
        contextJson: {
          intakeGoal: "full_annual",
          currentResidenceCountry: "BR",
          nationalityCountry: "BR"
        } as Prisma.JsonValue
      }
    );

    expect(result.outcomes[0]).toMatchObject({
      ok: false,
      name: "advance_conversation_state"
    });
    expect(result.outcomes[0]?.error).toMatch(/missing/i);
    expect(result.outcomes[0]?.error).toMatch(/physicallyLivesInBrazil/);
    expect(prismaMock.conversationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "fiscal_residence" })
      })
    );
  });
});
