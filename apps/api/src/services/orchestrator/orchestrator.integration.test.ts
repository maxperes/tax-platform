import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../prisma-client.js";

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
  config: {
    llmEnabled: false,
    privacyPolicyUrl: "https://example.com/privacy",
    llmMaxToolRounds: 2,
    llmMaxInFlight: 40,
    llmTimeoutMs: 60_000,
    llmMaxTokens: 2048
  }
}));

vi.mock("../jobs/queue.js", () => ({
  JOB_NAMES: {
    buildReport: "build-report",
    recomputeSessions: "recompute-sessions",
    extractDocument: "extract-document"
  },
  enqueueJob: vi.fn(async () => ({ jobId: "job-test-1", mode: "inline" })),
  enqueueAndWait: vi.fn(async () => ({ reportId: "report-test-id" }))
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
  runAssistantToolRecovery: vi.fn(),
  rewriteSafeResponse: vi.fn()
}));

import { handleUserMessage } from "./handle-user-message.js";
import { enqueueAndWait } from "../jobs/queue.js";

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

  it("parses numbered triage choice", async () => {
    seedSession();
    const result = await handleUserMessage("sess-1", "1");
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
    expect(
      (store.session!.contextJson as Record<string, unknown>)._fiscalProfileConfirmPending
    ).toBeUndefined();
  });

  it("fiscal confirm dual residence asks US filing then accepts the answer", async () => {
    const dualFiscalData = { ...sampleFiscalData, isFiscalResidentUSA: true };
    seedSession({
      contextJson: { intakeGoal: "full_annual", _fiscalProfileConfirmPending: true }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: dualFiscalData,
      derivedProfile: "dual_residence",
      requiresAdditionalReview: true
    });

    const confirmed = await handleUserMessage("sess-1", "yes");
    expect(confirmed.sessionState).toBe("fiscal_residence");
    expect(confirmed.assistantText).toMatch(/how do you usually file/i);
    expect(confirmed.assistantText).toMatch(/Dual residence/i);
    expect(confirmed.assistantText).not.toMatch(/dual_residence/);
    expect(confirmed.assistantText).not.toMatch(/FEIE/);
    expect(
      (store.session!.contextJson as Record<string, unknown>)._fiscalProfileConfirmPending
    ).toBeUndefined();
    expect((store.session!.contextJson as Record<string, unknown>)._usFilingPending).toBe(true);

    const filed = await handleUserMessage("sess-1", "1");
    expect(filed.sessionState).toBe("income_capture");
    expect(filed.assistantText).toMatch(/Noted — \*\*single\*\* for the US estimate/i);
    expect(filed.assistantText).not.toMatch(/FEIE/);
    expect((store.session!.contextJson as Record<string, unknown>).usFilingInputs).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect((store.session!.contextJson as Record<string, unknown>)._usFilingPending).toBe(false);
  });

  it("accepts US filing even if confirm flag was left stuck", async () => {
    seedSession({
      contextJson: {
        intakeGoal: "full_annual",
        _fiscalProfileConfirmPending: true,
        _usFilingPending: true,
        fiscalResidence: { ...sampleFiscalData, isFiscalResidentUSA: true }
      }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: { ...sampleFiscalData, isFiscalResidentUSA: true },
      derivedProfile: "dual_residence",
      requiresAdditionalReview: true
    });

    const result = await handleUserMessage("sess-1", "1");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toMatch(/Noted — \*\*single\*\* for the US estimate/i);
    expect(
      (store.session!.contextJson as Record<string, unknown>)._fiscalProfileConfirmPending
    ).toBeUndefined();
  });

  it("skips the US filing question when marital status is already single", async () => {
    const dualFiscalData = {
      ...sampleFiscalData,
      isFiscalResidentUSA: true,
      maritalStatus: "single"
    };
    seedSession({
      contextJson: { intakeGoal: "full_annual", _fiscalProfileConfirmPending: true }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: dualFiscalData,
      derivedProfile: "dual_residence",
      requiresAdditionalReview: true
    });

    const confirmed = await handleUserMessage("sess-1", "yes");
    expect(confirmed.sessionState).toBe("income_capture");
    expect(confirmed.assistantText).toMatch(/We'll use \*\*single\*\* for the US estimate/i);
    expect(confirmed.assistantText).not.toMatch(/how do you usually file/i);
    expect((store.session!.contextJson as Record<string, unknown>).usFilingInputs).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect((store.session!.contextJson as Record<string, unknown>)._usFilingPending).toBeUndefined();
  });

  it("asks jointly yes/no when married and saves mfj", async () => {
    const dualFiscalData = {
      ...sampleFiscalData,
      isFiscalResidentUSA: true,
      maritalStatus: "married"
    };
    seedSession({
      contextJson: { intakeGoal: "full_annual", _fiscalProfileConfirmPending: true }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: dualFiscalData,
      derivedProfile: "dual_residence",
      requiresAdditionalReview: true
    });

    const confirmed = await handleUserMessage("sess-1", "yes");
    expect(confirmed.sessionState).toBe("fiscal_residence");
    expect(confirmed.assistantText).toMatch(/jointly with your spouse/i);
    expect((store.session!.contextJson as Record<string, unknown>)._usFilingPending).toBe(true);

    const filed = await handleUserMessage("sess-1", "yes");
    expect(filed.sessionState).toBe("income_capture");
    expect(filed.assistantText).toMatch(/married filing jointly/i);
    expect((store.session!.contextJson as Record<string, unknown>).usFilingInputs).toEqual({
      filingStatus: "mfj",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
  });

  it("fiscal confirm no restarts fiscal questions", async () => {
    seedSession({
      contextJson: {
        intakeGoal: "foreign_salary",
        _fiscalProfileConfirmPending: true,
        _triagePending: true
      }
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
    expect((store.session!.contextJson as Record<string, unknown>)._triagePending).toBeUndefined();
  });

  it("after confirm no, fiscal field answers are accepted (not triage redirect)", async () => {
    seedSession({
      contextJson: {
        _fiscalProfileConfirmPending: true,
        _triagePending: true
      }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      data: sampleFiscalData,
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    await handleUserMessage("sess-1", "no");
    const answered = await handleUserMessage("sess-1", "Max Test");
    expect(answered.assistantText).not.toMatch(/Reply with \*\*1\*\*/);
    expect(answered.assistantText.toLowerCase()).not.toContain("choose your focus");
  });

  it("income done without an FX rate still advances (preview)", async () => {
    seedSession({
      state: "income_capture",
      contextJson: { intakeGoal: "foreign_salary", _triagePending: false }
    });
    prismaMock.incomeSource.findMany.mockImplementation(async () => [
      {
        id: "inc-1",
        payerName: "Employer",
        originCountry: "US",
        incomeType: "salary",
        grossAmount: { toNumber: () => 5000 },
        originalCurrency: "GBP",
        paymentDate: new Date("2026-01-31"),
        periodicity: "monthly",
        grossAmountBrl: null,
        exchangeRateToBrl: null,
        taxPaidOriginCountry: null,
        withholdingTax: null,
        nature: "work",
        classification: { calculationModule: "carnet_leao" },
        notes: null
      }
    ]);

    const result = await handleUserMessage("sess-1", "that's all");
    expect(result.sessionState).toBe("income_capture");
    expect(result.assistantText).toMatch(/asset/i);
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
    expect(enqueueAndWait).toHaveBeenCalledWith("build-report", { userId: "user-1", taxYear: 2026 });
    expect(result.sessionState).toBe("complete");
    expect(result.assistantText).toMatch(/is ready/i);
    expect(result.assistantText).toMatch(/View filing report/i);
    expect(result.assistantText).not.toMatch(/\/api\/jobs/);
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

  it("regenerates the report from income_capture after an edit", async () => {
    seedSession({
      state: "income_capture",
      contextJson: { intakeGoal: "foreign_salary", _triagePending: false }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });
    prismaMock.incomeSource.findMany.mockResolvedValue([]);

    const result = await handleUserMessage("sess-1", "regenerate the report");
    expect(enqueueAndWait).toHaveBeenCalledWith("build-report", { userId: "user-1", taxYear: 2026 });
    expect(result.sessionState).toBe("complete");
    expect(result.assistantText).toMatch(/is ready/i);
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

  it("explains immigration status instead of skipping to first entry", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        physicallyLivesInBrazil: true,
        brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-12-31" }],
        isFiscalResidentBrazil: true,
        isFiscalResidentUSA: false,
        fiscalResidenceOtherCountry: false,
        _lastAskedKey: "immigrationStatus"
      }
    });
    store.messages.push({
      role: "assistant",
      content: "Now, do you have any immigration status in Brazil? (yes/no)",
      createdAt: new Date()
    });

    const result = await handleUserMessage("sess-1", "explain");
    expect(result.assistantText).toMatch(/immigration category/i);
    expect(result.assistantText).toMatch(/tourist/i);
    expect(result.assistantText).not.toMatch(/keep this focused/i);
    expect(result.assistantText).not.toMatch(/first entry/i);
  });

  it("re-asks immigration categories when user answers yes/no", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        physicallyLivesInBrazil: true,
        brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-12-31" }],
        isFiscalResidentBrazil: true,
        isFiscalResidentUSA: false,
        fiscalResidenceOtherCountry: false,
        _lastAskedKey: "immigrationStatus"
      }
    });
    store.messages.push({
      role: "assistant",
      content: "What Brazilian immigration status applies?",
      createdAt: new Date()
    });

    const result = await handleUserMessage("sess-1", "yes");
    expect(result.assistantText).toMatch(/category/i);
    expect(result.assistantText).toMatch(/1–9|1-9|tourist/i);
    expect((store.session!.contextJson as Record<string, unknown>).immigrationStatus).toBeUndefined();
  });

  it("clears asset screen pending when rewinding to fiscal residence", async () => {
    seedSession({
      state: "events",
      contextJson: {
        intakeGoal: "full_annual",
        _assetScreenPending: true,
        _usFilingPending: true
      }
    });

    const result = await handleUserMessage("sess-1", "go back to fiscal residence");
    expect(result.sessionState).toBe("fiscal_residence");
    expect((store.session!.contextJson as Record<string, unknown>)._assetScreenPending).toBeUndefined();
    expect((store.session!.contextJson as Record<string, unknown>)._usFilingPending).toBeUndefined();
  });

  it("does not skip patrimony on mid-sentence no", async () => {
    seedSession({
      state: "patrimony",
      contextJson: { intakeGoal: "full_annual" }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage(
      "sess-1",
      "I have no foreign property but own a house in Brazil"
    );
    expect(result.sessionState).toBe("patrimony");
    expect(result.assistantText).not.toMatch(/skipping this step/i);
  });

  it("does not advance events on continue-fixing prose", async () => {
    seedSession({
      state: "events",
      contextJson: { intakeGoal: "full_annual" }
    });
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });

    const result = await handleUserMessage("sess-1", "I want to continue fixing income amounts");
    expect(result.sessionState).toBe("events");
    expect(result.assistantText).not.toMatch(/derived taxable events.*confirmed/i);
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

  it("accepts slash birth dates and does not lecture on format", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        isFiscalResidentBrazil: true,
        _lastAskedKey: "birthDate"
      }
    });
    store.messages.push({
      role: "assistant",
      content: "What is your date of birth? Please use the format YYYY-MM-DD.",
      createdAt: new Date()
    });

    const result = await handleUserMessage("sess-1", "01/01/1988");
    expect(result.assistantText).not.toMatch(/date format is incorrect/i);
    expect(result.assistantText).not.toMatch(/can't answer unrelated/i);
    expect(result.assistantText).not.toMatch(/progress on the fiscal profile/i);
    expect(store.session?.contextJson).toMatchObject({ birthDate: "1988-01-01" });
  });

  it("does not treat a corrected ISO date as off-topic", async () => {
    seedSession({
      state: "fiscal_residence",
      contextJson: {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        physicallyLivesInBrazil: true,
        brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-04-01" }],
        isFiscalResidentBrazil: true,
        isFiscalResidentUSA: false,
        fiscalResidenceOtherCountry: false,
        immigrationStatus: "none",
        hasCpf: true,
        birthDate: "1988-01-01",
        _lastAskedKey: "hasResidencePermit"
      }
    });
    store.messages.push({
      role: "assistant",
      content:
        "It seems the date format is incorrect. Please provide your date of birth using the format YYYY-MM-DD (for example, 1988-01-01).",
      createdAt: new Date()
    });

    const result = await handleUserMessage("sess-1", "1988-01-01");
    expect(result.assistantText).not.toMatch(/can't answer unrelated/i);
    expect(result.assistantText).toMatch(/residence permit/i);
    expect(store.session?.contextJson).toMatchObject({ birthDate: "1988-01-01" });
  });
});
