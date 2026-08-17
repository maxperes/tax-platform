import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../prisma-client.js";

type SessionRow = {
  id: string;
  userId: string;
  taxYear: number;
  state: string;
  contextJson: Prisma.JsonValue;
  requiresAdditionalReview: boolean;
};

const store = vi.hoisted(() => ({
  session: null as SessionRow | null,
  messages: [] as { role: string; content: string; createdAt: Date }[]
}));

const prismaMock = vi.hoisted(() => ({
  conversationSession: {
    findUnique: vi.fn(async () => store.session),
    findUniqueOrThrow: vi.fn(async () => {
      if (!store.session) throw new Error("Session not found");
      return store.session;
    }),
    update: vi.fn(async ({ data }: { data: Partial<SessionRow> }) => {
      if (!store.session) throw new Error("Session not found");
      store.session = { ...store.session, ...data };
      return store.session;
    })
  },
  conversationMessage: {
    create: vi.fn(async ({ data }: { data: { role: string; content: string } }) => {
      store.messages.push({ ...data, createdAt: new Date() });
      return { id: String(store.messages.length) };
    }),
    findMany: vi.fn(
      async ({
        orderBy,
        take
      }: {
        orderBy?: { createdAt?: "asc" | "desc" };
        take?: number;
      } = {}) => {
        let rows = [...store.messages];
        if (orderBy?.createdAt === "desc") rows = rows.reverse();
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }
    )
  },
  fiscalResidenceProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  incomeSource: { findMany: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn(async () => ({ email: "u@example.com" })) }
}));

vi.mock("../../db.js", () => ({ prisma: prismaMock }));
vi.mock("../../config.js", () => ({
  config: {
    llmEnabled: true,
    privacyPolicyUrl: "",
    llmMaxToolRounds: 2,
    llmMaxInFlight: 40,
    llmTimeoutMs: 60_000,
    llmMaxTokens: 2048
  }
}));

const runAssistantWithTools = vi.hoisted(() => vi.fn());
const runAssistantToolRecovery = vi.hoisted(() => vi.fn());

vi.mock("../llm.js", () => ({
  runAssistantWithTools,
  runAssistantToolRecovery,
  rewriteSafeResponse: vi.fn()
}));

vi.mock("../persistence/income.js", () => ({
  createClassifiedIncome: vi.fn(async () => ({ id: "inc-1" }))
}));

vi.mock("../intake-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../intake-helpers.js")>();
  return {
    ...actual,
    loadIntakeModulePlan: vi.fn(async () => ({
      derivedProfile: "undetermined",
      needsCarnetLeao: true,
      needsCapitalGainStep: true,
      needsUsAnnual: false,
      skipMonthly: false,
      intakeGoal: "full_annual"
    }))
  };
});

import { handleUserMessage } from "./handle-user-message.js";
import { createClassifiedIncome } from "../persistence/income.js";

function seedIncomeSession() {
  store.session = {
    id: "sess-llm-recovery",
    userId: "user-1",
    taxYear: 2026,
    state: "income_capture",
    contextJson: { _triagePending: false, intakeGoal: "full_annual" } as Prisma.JsonValue,
    requiresAdditionalReview: false
  };
  store.messages = [
    {
      role: "assistant",
      content: "Add an income source.",
      createdAt: new Date()
    }
  ];
}

describe("LLM tool recovery turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.session = null;
    store.messages = [];
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.incomeSource.count.mockResolvedValue(0);
  });

  it("feeds Zod failures back and applies a successful recovery tool call", async () => {
    seedIncomeSession();

    runAssistantWithTools.mockResolvedValueOnce({
      content: "",
      toolCalls: [
        {
          id: "bad-1",
          type: "function",
          function: {
            name: "submit_income_source",
            arguments: JSON.stringify({ income: { payerName: "Acme" } })
          }
        }
      ],
      assistantMessage: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "bad-1",
            type: "function",
            function: {
              name: "submit_income_source",
              arguments: JSON.stringify({ income: { payerName: "Acme" } })
            }
          }
        ]
      }
    });

    runAssistantToolRecovery.mockResolvedValueOnce({
      content: "Saved your income row.",
      toolCalls: [
        {
          id: "good-1",
          type: "function",
          function: {
            name: "submit_income_source",
            arguments: JSON.stringify({
              income: {
                payerName: "Acme",
                originCountry: "US",
                incomeType: "salary",
                grossAmount: 10000,
                originalCurrency: "USD",
                paymentDate: "2026-01-31",
                periodicity: "monthly",
                nature: "work"
              }
            })
          }
        }
      ]
    });

    const result = await handleUserMessage(
      "sess-llm-recovery",
      "Please use tools to capture my Acme salary; I will clarify fields next"
    );

    expect(runAssistantToolRecovery).toHaveBeenCalledTimes(1);
    const recoveryArg = runAssistantToolRecovery.mock.calls[0]?.[0] as {
      toolResults: { toolCallId: string; content: string }[];
    };
    expect(recoveryArg.toolResults[0]?.toolCallId).toBe("bad-1");
    expect(recoveryArg.toolResults[0]?.content).toContain('"ok":false');
    expect(createClassifiedIncome).toHaveBeenCalledTimes(1);
    expect(result.assistantText).toMatch(/Saved your income row/i);
  });

  it("returns request_clarification question to the user", async () => {
    seedIncomeSession();

    runAssistantWithTools.mockResolvedValueOnce({
      content: "I need a bit more detail.",
      toolCalls: [
        {
          id: "clar-1",
          type: "function",
          function: {
            name: "request_clarification",
            arguments: JSON.stringify({ question: "Is that amount monthly or annual?" })
          }
        }
      ],
      assistantMessage: {
        role: "assistant",
        content: "I need a bit more detail.",
        tool_calls: [
          {
            id: "clar-1",
            type: "function",
            function: {
              name: "request_clarification",
              arguments: JSON.stringify({ question: "Is that amount monthly or annual?" })
            }
          }
        ]
      }
    });

    const result = await handleUserMessage(
      "sess-llm-recovery",
      "Please ask me whatever field is still unclear about that income"
    );

    expect(runAssistantToolRecovery).not.toHaveBeenCalled();
    expect(result.assistantText).toBe("Is that amount monthly or annual?");
  });
});
