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
    findMany: vi.fn(async () => store.messages)
  },
  fiscalResidenceProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  incomeSource: { findMany: vi.fn(), count: vi.fn() }
}));

vi.mock("../../db.js", () => ({ prisma: prismaMock }));
vi.mock("../../config.js", () => ({ config: { llmEnabled: true, privacyPolicyUrl: "" } }));

const runAssistantWithTools = vi.hoisted(() => vi.fn());

vi.mock("../llm.js", () => ({
  runAssistantWithTools,
  rewriteSafeResponse: vi.fn()
}));

import { handleUserMessage } from "./handle-user-message.js";

function seedSession(contextJson: Record<string, unknown>) {
  store.session = {
    id: "sess-llm",
    userId: "user-1",
    taxYear: 2026,
    state: "fiscal_residence",
    contextJson: contextJson as Prisma.JsonValue,
    requiresAdditionalReview: false
  };
  store.messages = [
    {
      role: "assistant",
      content: "Let's capture your fiscal profile.",
      createdAt: new Date()
    }
  ];
}

describe("runLlmTurn fiscal_residence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.session = null;
    store.messages = [];
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
  });

  it("does not append a second deterministic question after the LLM reply", async () => {
    seedSession({
      _triagePending: false,
      intakeGoal: "full_annual",
      currentResidenceCountry: "BR",
      nationalityCountry: "BR",
      isFiscalResidentBrazil: true
    });
    runAssistantWithTools.mockResolvedValue({
      content: "Thanks for confirming! When is your birth date? Please provide it in the format YYYY-MM-DD.",
      toolCalls: []
    });

    const result = await handleUserMessage("sess-llm", "yes");

    expect(result.assistantText).toBe(
      "Thanks for confirming! When is your birth date? Please provide it in the format YYYY-MM-DD."
    );
    expect(result.assistantText).not.toMatch(/Now, let's continue/i);
    expect(result.assistantText).not.toMatch(/fiscal resident of the United States/i);
    expect(store.session?.contextJson).toMatchObject({ _lastAskedKey: "birthDate" });
  });
});
