import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSATION_STATES, type ConversationState } from "@tax-platform/shared";
import type { Prisma } from "../../prisma-client.js";

type SessionRow = {
  id: string;
  userId: string;
  taxYear: number;
  state: string;
  contextJson: Prisma.JsonValue;
  requiresAdditionalReview: boolean;
};

type IncomeRow = {
  id: string;
  userId: string;
  taxYear: number;
  payerName: string;
  originCountry: string;
  incomeType: string;
  grossAmount: { toNumber: () => number };
  originalCurrency: string;
  paymentDate: Date;
  periodicity: string;
  taxPaidOriginCountry: { toNumber: () => number } | null;
  withholdingTax: { toNumber: () => number } | null;
  hasProofDocument: boolean | null;
  destinationAccountHint: string | null;
  transferredToBrazil: boolean | null;
  remainedAbroad: boolean | null;
  nature: string;
  notes: string | null;
  exchangeRateToBrl: { toNumber: () => number } | null;
  grossAmountBrl: { toNumber: () => number } | null;
  classification: unknown;
};

type FiscalProfileRow = {
  userId: string;
  taxYear: number;
  data: unknown;
  derivedProfile: string;
  requiresAdditionalReview: boolean;
};

const TURN_BUDGET = 80;

const store = vi.hoisted(() => ({
  session: null as SessionRow | null,
  messages: [] as { role: string; content: string; createdAt: Date }[],
  incomes: [] as IncomeRow[],
  fiscalProfile: null as FiscalProfileRow | null
}));

function asDecimal(value: unknown): { toNumber: () => number } | null {
  if (value == null) return null;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return value as { toNumber: () => number };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return { toNumber: () => n };
}

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
  user: {
    findUnique: vi.fn(async () => ({ email: "jane@example.com" }))
  },
  fiscalResidenceProfile: {
    findUnique: vi.fn(async () => store.fiscalProfile),
    upsert: vi.fn(async ({ create, update }: { create: FiscalProfileRow; update: Partial<FiscalProfileRow> }) => {
      store.fiscalProfile = store.fiscalProfile
        ? { ...store.fiscalProfile, ...update }
        : { ...create };
      return store.fiscalProfile;
    })
  },
  incomeSource: {
    findMany: vi.fn(async () => store.incomes),
    count: vi.fn(async () => store.incomes.length),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: IncomeRow = {
        id: `inc-${store.incomes.length + 1}`,
        userId: String(data.userId),
        taxYear: Number(data.taxYear),
        payerName: String(data.payerName),
        originCountry: String(data.originCountry),
        incomeType: String(data.incomeType),
        grossAmount: asDecimal(data.grossAmount) ?? { toNumber: () => 0 },
        originalCurrency: String(data.originalCurrency),
        paymentDate: data.paymentDate instanceof Date ? data.paymentDate : new Date(String(data.paymentDate)),
        periodicity: String(data.periodicity),
        taxPaidOriginCountry: asDecimal(data.taxPaidOriginCountry),
        withholdingTax: asDecimal(data.withholdingTax),
        hasProofDocument: (data.hasProofDocument as boolean | null) ?? null,
        destinationAccountHint: (data.destinationAccountHint as string | null) ?? null,
        transferredToBrazil: (data.transferredToBrazil as boolean | null) ?? null,
        remainedAbroad: (data.remainedAbroad as boolean | null) ?? null,
        nature: String(data.nature ?? "other"),
        notes: (data.notes as string | null) ?? null,
        exchangeRateToBrl: asDecimal(data.exchangeRateToBrl),
        grossAmountBrl: asDecimal(data.grossAmountBrl),
        classification: data.classification ?? null
      };
      store.incomes.push(row);
      return row;
    })
  },
  taxableEvent: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []), deleteMany: vi.fn(), create: vi.fn() },
  deduction: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
  capitalGainCalculation: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
  monthlyTaxCalculation: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
  taxReport: {
    findUnique: vi.fn(async () => ({
      id: "report-test-id",
      title: "Tax report 2026",
      requiresAdditionalReview: false,
      ruleVersion: "test"
    })),
    create: vi.fn()
  },
  taxCalculation: { findMany: vi.fn(async () => []) }
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
    syncTaxableEvents: vi.fn(async () => 0),
    recomputeMonthlyTax: vi.fn(async () => undefined),
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
import { getActiveFiscalFieldOrder, isValidFiscalFieldValue } from "../fiscal-intake.js";
import { resolveFiscalFieldBeingAsked } from "./fiscal-orchestration.js";

/** Canned answers keyed by fiscal field. Fail the walk if a new field is added without a fixture. */
const FISCAL_ANSWERS: Record<string, string> = {
  physicallyLivesInBrazil: "yes",
  brazilStaysText: "2024-01-01, 2024-06-15\n2024-09-01, ongoing",
  currentResidenceCountry: "Brazil",
  nationalityCountry: "Brazil",
  isFiscalResidentBrazil: "yes",
  isFiscalResidentUSA: "no",
  fiscalResidenceOtherCountry: "no",
  immigrationStatus: "8",
  hasCpf: "yes",
  hasResidencePermit: "yes",
  lastFilingCountry: "Brazil",
  filedBrazilianReturn: "yes",
  declaredPermanentExitBrazil: "not applicable",
  maritalStatus: "1",
  dependentsCount: "0",
  daysInUSACalendarYear: "0",
  hasUSCitizenship: "no",
  hasGreenCard: "no",
  birthDate: "1990-01-01",
  fullName: "Jane Doe"
};

const loop = {
  turns: 0,
  fingerprints: new Map<string, number>(),
  visitedStates: [] as ConversationState[],
  askedFiscalKeys: [] as string[]
};

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
  store.incomes = [];
  store.fiscalProfile = null;
  loop.turns = 0;
  loop.fingerprints = new Map();
  loop.visitedStates = [((overrides.state ?? "fiscal_residence") as ConversationState)];
  loop.askedFiscalKeys = [];
}

function sessionCtx(): Record<string, unknown> {
  return (store.session?.contextJson as Record<string, unknown>) ?? {};
}

function lastAssistant(): string {
  for (let i = store.messages.length - 1; i >= 0; i--) {
    if (store.messages[i]!.role === "assistant") return store.messages[i]!.content;
  }
  return "";
}

function stateRank(state: string): number {
  return CONVERSATION_STATES.indexOf(state as ConversationState);
}

async function say(text: string): Promise<{
  assistantText: string;
  sessionState: ConversationState;
  ctx: Record<string, unknown>;
}> {
  loop.turns += 1;
  expect(loop.turns, `copilot conversation exceeded ${TURN_BUDGET} turns`).toBeLessThanOrEqual(TURN_BUDGET);

  const beforeState = store.session!.state;
  const beforeCtx = sessionCtx();
  const askedBefore = resolveFiscalFieldBeingAsked(beforeCtx, lastAssistant());

  const result = await handleUserMessage("sess-1", text);
  const afterCtx = sessionCtx();

  expect(
    stateRank(result.sessionState),
    `state moved backward from ${beforeState} to ${result.sessionState}`
  ).toBeGreaterThanOrEqual(stateRank(beforeState));

  if (loop.visitedStates[loop.visitedStates.length - 1] !== result.sessionState) {
    loop.visitedStates.push(result.sessionState);
  }

  if (
    beforeState === "fiscal_residence" &&
    askedBefore &&
    isValidFiscalFieldValue(askedBefore, afterCtx[askedBefore])
  ) {
    loop.askedFiscalKeys.push(askedBefore);
    if (result.sessionState === "fiscal_residence") {
      const askedAfter = resolveFiscalFieldBeingAsked(afterCtx, result.assistantText);
      expect(askedAfter, `re-asked fiscal field ${askedBefore} after a valid answer`).not.toBe(askedBefore);
    }
  }

  const fingerprint = `${result.sessionState}|${String(afterCtx._lastAskedKey ?? "")}|${result.assistantText}`;
  const repeats = (loop.fingerprints.get(fingerprint) ?? 0) + 1;
  loop.fingerprints.set(fingerprint, repeats);
  expect(repeats, `stuck repeating the same assistant turn: ${fingerprint.slice(0, 180)}`).toBeLessThan(3);

  return { assistantText: result.assistantText, sessionState: result.sessionState, ctx: afterCtx };
}

async function answerTriage(choice: string): Promise<void> {
  const result = await say(choice);
  expect(result.ctx._triagePending).toBe(false);
  expect(result.sessionState).toBe("fiscal_residence");
}

async function answerAllFiscalFields(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (store.session!.state !== "fiscal_residence") break;
    if (sessionCtx()._usFilingPending === true) break;
    const key = resolveFiscalFieldBeingAsked(sessionCtx(), lastAssistant());
    expect(key, "orchestrator asked an unknown fiscal field").toBeTruthy();
    const answer = FISCAL_ANSWERS[key!];
    expect(answer, `add a canned answer for fiscal field ${key}`).toBeDefined();
    await say(answer);
  }
  expect(store.session!.state).toBe("income_capture");
}

function expectedFiscalKeys(): string[] {
  return getActiveFiscalFieldOrder({
    currentResidenceCountry: "BR",
    nationalityCountry: "BR",
    isFiscalResidentBrazil: true,
    isFiscalResidentUSA: false,
    fiscalResidenceOtherCountry: false,
    immigrationStatus: "citizen",
    lastFilingCountry: "BR"
  }).map((field) => field.key);
}

async function captureBrlIncomeAndAssets(): Promise<void> {
  const saved = await say("salary from Acme 10900 BRL 2026-01-31");
  expect(saved.sessionState).toBe("income_capture");
  expect(saved.assistantText).toMatch(/saved/i);
  const done = await say("that's all");
  expect(done.sessionState).toBe("income_capture");
  expect(done.ctx._assetScreenPending).toBe(true);
  const assets = await say("none");
  expect(assets.sessionState).toBe("events");
}

describe("copilot chained happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedSession();
  });

  it("walks foreign_salary from triage through report complete", async () => {
    await answerTriage("1");
    await answerAllFiscalFields();
    expect(loop.askedFiscalKeys).toEqual(expectedFiscalKeys());

    await captureBrlIncomeAndAssets();

    const events = await say("yes looks correct");
    expect(events.sessionState).toBe("deductions");
    expect(events.assistantText).toMatch(/Capital gains are skipped/i);

    const deductions = await say("no deductions");
    expect(deductions.sessionState).toBe("report");

    const done = await say("generate the report");
    expect(done.sessionState).toBe("complete");
    expect(enqueueAndWait).toHaveBeenCalledWith("build-report", { userId: "user-1", taxYear: 2026 });
    expect(loop.visitedStates).toEqual([
      "fiscal_residence",
      "income_capture",
      "events",
      "deductions",
      "report",
      "complete"
    ]);
  });

  it("walks full_annual through every module step", async () => {
    await answerTriage("4");
    await answerAllFiscalFields();
    await captureBrlIncomeAndAssets();

    const events = await say("yes looks correct");
    expect(events.sessionState).toBe("capital_gain");
    expect(events.assistantText).toMatch(/Did you \*\*sell\*\* anything/i);
    expect(events.assistantText).toMatch(/\bnone\b/i);
    expect(events.assistantText).not.toMatch(/disposition/i);
    expect((await say("none")).sessionState).toBe("patrimony");
    expect((await say("none")).sessionState).toBe("transfers");
    expect((await say("none")).sessionState).toBe("trust_registry");
    expect((await say("none")).sessionState).toBe("entity_simulation");
    expect((await say("none")).sessionState).toBe("deductions");
    expect((await say("no deductions")).sessionState).toBe("report");
    expect((await say("generate the report")).sessionState).toBe("complete");

    expect(loop.visitedStates).toEqual([
      "fiscal_residence",
      "income_capture",
      "events",
      "capital_gain",
      "patrimony",
      "transfers",
      "trust_registry",
      "entity_simulation",
      "deductions",
      "report",
      "complete"
    ]);
    expect(enqueueAndWait).toHaveBeenCalledWith("build-report", { userId: "user-1", taxYear: 2026 });
  });
});

describe("copilot chained stuck and skip regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedSession();
  });

  it("re-asks immigration after yes/no, then accepts a category", async () => {
    await answerTriage("1");
    while (resolveFiscalFieldBeingAsked(sessionCtx(), lastAssistant()) !== "immigrationStatus") {
      const key = resolveFiscalFieldBeingAsked(sessionCtx(), lastAssistant());
      expect(key).toBeTruthy();
      expect(store.session!.state).toBe("fiscal_residence");
      await say(FISCAL_ANSWERS[key!]!);
    }

    const bounced = await say("yes");
    expect(bounced.sessionState).toBe("fiscal_residence");
    expect(resolveFiscalFieldBeingAsked(bounced.ctx, bounced.assistantText)).toBe("immigrationStatus");
    expect(bounced.assistantText).toMatch(/category/i);

    const accepted = await say("8");
    expect(accepted.sessionState).toBe("fiscal_residence");
    expect(isValidFiscalFieldValue("immigrationStatus", accepted.ctx.immigrationStatus)).toBe(true);
    expect(resolveFiscalFieldBeingAsked(accepted.ctx, accepted.assistantText)).not.toBe("immigrationStatus");
  });

  it("does not block that's all when a non-PTAX currency has no rate (preview)", async () => {
    await answerTriage("1");
    await answerAllFiscalFields();

    const saved = await say("salary from Acme 5000 GBP 2026-01-31");
    expect(saved.sessionState).toBe("income_capture");
    expect(store.incomes).toHaveLength(1);

    const done = await say("that's all");
    expect(done.sessionState).toBe("income_capture");
    expect(done.ctx._assetScreenPending).toBe(true);
    expect(done.assistantText).toMatch(/asset/i);
  });

  it("does not complete report on yes without a summary offer, then generate the report does", async () => {
    await answerTriage("1");
    await answerAllFiscalFields();
    await captureBrlIncomeAndAssets();
    await say("yes looks correct");
    await say("no deductions");
    expect(store.session!.state).toBe("report");

    const ignored = await say("yes");
    expect(ignored.sessionState).toBe("report");
    expect(enqueueAndWait).not.toHaveBeenCalled();

    const done = await say("generate the report");
    expect(done.sessionState).toBe("complete");
    expect(enqueueAndWait).toHaveBeenCalledWith("build-report", { userId: "user-1", taxYear: 2026 });
  });

  it("advances _lastAskedKey after a valid country answer", async () => {
    await answerTriage("1");
    expect(resolveFiscalFieldBeingAsked(sessionCtx(), lastAssistant())).toBe("physicallyLivesInBrazil");

    const inBrazil = await say("yes");
    expect(inBrazil.sessionState).toBe("fiscal_residence");
    expect(isValidFiscalFieldValue("physicallyLivesInBrazil", inBrazil.ctx.physicallyLivesInBrazil)).toBe(true);
    expect(inBrazil.ctx._lastAskedKey).toBe("brazilStaysText");

    const next = await say("2024-01-01, 2024-06-01");
    expect(next.sessionState).toBe("fiscal_residence");
    expect(next.ctx._lastAskedKey).toBe("currentResidenceCountry");
    expect(resolveFiscalFieldBeingAsked(next.ctx, next.assistantText)).toBe("currentResidenceCountry");
  });

  it("keeps triage pending on unparseable input without looping", async () => {
    const first = await say("asdf");
    expect(first.ctx._triagePending).toBe(true);
    expect(first.sessionState).toBe("fiscal_residence");
    expect(first.assistantText).toMatch(/1\*\*|focus|intake/i);

    const second = await say("zzz");
    expect(second.ctx._triagePending).toBe(true);
    expect(second.sessionState).toBe("fiscal_residence");

    await answerTriage("1");
    expect(sessionCtx()._triagePending).toBe(false);
  });
});
