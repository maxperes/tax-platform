import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const sampleFiscalData = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  nationalityCountry: "BR",
  currentResidenceCountry: "BR",
  birthDate: "1990-01-01",
  primaryCurrency: "BRL",
  isFiscalResidentBrazil: true,
  isFiscalResidentUSA: false,
  fiscalResidenceOtherCountry: false
};

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
  fiscalResidenceProfile: {
    findUnique: vi.fn(),
    upsert: vi.fn()
  },
  incomeSource: {
    findMany: vi.fn(),
    count: vi.fn()
  },
  taxableEvent: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  deduction: { count: vi.fn(), findMany: vi.fn(async () => []) },
  capitalGainCalculation: {
    count: vi.fn(),
    findMany: vi.fn(async () => [])
  },
  monthlyTaxCalculation: {
    count: vi.fn(),
    findMany: vi.fn(async () => [])
  },
  taxReport: { findUnique: vi.fn(), create: vi.fn() },
  taxCalculation: { findMany: vi.fn() }
}));

vi.mock("../../db.js", () => ({ prisma: prismaMock }));

vi.mock("../../config.js", () => ({
  config: { llmEnabled: false, privacyPolicyUrl: "https://example.com/privacy" }
}));

vi.mock("../tax-pipeline.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tax-pipeline.js")>();
  return {
    ...actual,
    buildAndSaveReport: vi.fn(async () => "report-test-id"),
    getLatestTaxCalculationSnapshot: vi.fn(async () => [])
  };
});

vi.mock("../llm.js", () => ({
  runAssistantWithTools: vi.fn(),
  rewriteSafeResponse: vi.fn()
}));

import { handleUserMessage } from "./handle-user-message.js";
import { buildAndSaveReport } from "../tax-pipeline.js";

function seedSession(overrides: Partial<SessionRow> = {}) {
  store.session = {
    id: "sess-1",
    userId: "user-1",
    taxYear: 2026,
    state: "fiscal_residence",
    contextJson: { _triagePending: true },
    requiresAdditionalReview: false,
    ...overrides
  };
  store.messages = [{ role: "assistant", content: "Welcome", createdAt: new Date() }];
}

describe("handleUserMessage orchestrator pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.session = null;
    store.messages = [];

    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue(null);
    prismaMock.fiscalResidenceProfile.upsert.mockResolvedValue({});
    prismaMock.incomeSource.findMany.mockResolvedValue([]);
    prismaMock.taxableEvent.count.mockResolvedValue(0);
    prismaMock.taxableEvent.findMany.mockResolvedValue([]);
    prismaMock.deduction.count.mockResolvedValue(0);
    prismaMock.capitalGainCalculation.count.mockResolvedValue(0);
    prismaMock.monthlyTaxCalculation.count.mockResolvedValue(0);
    prismaMock.taxReport.findUnique.mockResolvedValue({
      id: "report-test-id",
      title: "Tax report 2026",
      requiresAdditionalReview: false,
      ruleVersion: "test"
    });
  });

  it("parses triage goal and clears _triagePending", async () => {
    seedSession();
    const result = await handleUserMessage("sess-1", "foreign salary paid abroad");
    expect(result.sessionState).toBe("fiscal_residence");
    expect(result.assistantText).toContain("Recorded focus");
    expect((store.session!.contextJson as Record<string, unknown>)._triagePending).toBe(false);
    expect((store.session!.contextJson as Record<string, unknown>).intakeGoal).toBe("foreign_salary");
  });

  it("fiscal confirm yes advances to income_capture", async () => {
    seedSession({
      contextJson: { intakeGoal: "foreign_salary", _fiscalProfileConfirmPending: true }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: sampleFiscalData,
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "yes");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toContain("fiscal profile");
  });

  it("fiscal confirm no restarts fiscal questions", async () => {
    seedSession({
      contextJson: { intakeGoal: "foreign_salary", _fiscalProfileConfirmPending: true }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: sampleFiscalData,
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "no");
    expect(result.sessionState).toBe("fiscal_residence");
    expect(result.assistantText).toContain("re-enter");
    expect(
      (store.session!.contextJson as Record<string, unknown>)._fiscalProfileConfirmPending
    ).toBeUndefined();
  });

  it("income done with blocking gaps stays on income_capture", async () => {
    seedSession({
      state: "income_capture",
      contextJson: { intakeGoal: "foreign_salary", _triagePending: false }
    });
    prismaMock.incomeSource.findMany.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
      const baseRow = {
        id: "inc-1",
        payerName: "Employer",
        originCountry: "US",
        incomeType: "salary",
        grossAmount: { toNumber: () => 5000 },
        originalCurrency: "USD",
        paymentDate: new Date("2026-01-31"),
        periodicity: "monthly",
        grossAmountBrl: null,
        exchangeRateToBrl: null,
        taxPaidOriginCountry: null,
        withholdingTax: null,
        nature: "work",
        classification: { calculationModule: "carnet_leao" },
        notes: null
      };
      if (args?.select?.paymentDate) {
        return [baseRow];
      }
      return [baseRow];
    });

    const result = await handleUserMessage("sess-1", "that's all");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toMatch(/BRL|exchange|Carnê/i);
  });

  it("events confirm with foreign_salary skips to deductions", async () => {
    seedSession({
      state: "events",
      contextJson: { intakeGoal: "foreign_salary", _triagePending: false }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "yes looks correct");
    expect(result.sessionState).toBe("deductions");
    expect(result.assistantText).toContain("Capital gains are skipped");
  });

  it("summary yes on report generates report and moves to complete", async () => {
    seedSession({ state: "report", contextJson: { intakeGoal: "foreign_salary" } });
    store.messages.push({
      role: "assistant",
      content: "Would you like me to summarize the information collected?",
      createdAt: new Date()
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "yes");
    expect(buildAndSaveReport).toHaveBeenCalledWith("user-1", 2026);
    expect(result.sessionState).toBe("complete");
    expect(result.assistantText).toContain("report was generated");
  });

  it("rewind from complete opens earlier step", async () => {
    seedSession({
      state: "complete",
      contextJson: { intakeGoal: "foreign_salary" }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "go back to income");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toContain("Opening **income capture**");
  });

  it("trust concern returns privacy-aware response and stays on current step", async () => {
    seedSession({ state: "income_capture", contextJson: { intakeGoal: "foreign_salary" } });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "do you store my data?");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toMatch(/store|privacy/i);
  });

  it("help intent repeats current step guidance", async () => {
    seedSession({ state: "income_capture", contextJson: { intakeGoal: "foreign_salary" } });
    prismaMock.incomeSource.findMany.mockResolvedValue([]);

    const result = await handleUserMessage("sess-1", "help");
    expect(result.assistantText).toMatch(/Help — income/i);
    expect(result.assistantText).toMatch(/that's all/i);
  });

  it("triage clarification explains options instead of off-topic redirect", async () => {
    seedSession({ state: "fiscal_residence", contextJson: { _triagePending: true } });

    const result = await handleUserMessage("sess-1", "what is the difference between foreign_salary and full_annual?");
    expect(result.assistantText).toMatch(/Intake focus options/i);
    expect(result.assistantText).not.toMatch(/can't answer unrelated/i);
  });

  it("accepts country name Brazil during fiscal intake", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: { _triagePending: false, intakeGoal: "full_annual", _lastAskedKey: "currentResidenceCountry" }
    });

    const result = await handleUserMessage("sess-1", "Brazil");
    expect(result.assistantText).toMatch(/nationality|Brazil|BR/i);
    expect(store.session?.contextJson).toMatchObject({ currentResidenceCountry: "BR" });
  });

  it("does not treat birth date answer as off-topic when assistant asked birth date early", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        isFiscalResidentBrazil: true
      }
    });
    store.messages.push({
      role: "assistant",
      content:
        "Thanks for confirming! When is your birth date? Please provide it in the format YYYY-MM-DD.",
      createdAt: new Date()
    });

    const result = await handleUserMessage("sess-1", "1988-01-01");
    expect(result.assistantText).not.toMatch(/can't answer unrelated/i);
    expect(store.session?.contextJson).toMatchObject({ birthDate: "1988-01-01" });
  });
});
