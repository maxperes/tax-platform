import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyIncome, buildTaxReportSummary } from "@tax-platform/rules";
import { DATA_PACK_BR_2026, buildRuleVersionStamp } from "@tax-platform/shared";

const prismaMock = vi.hoisted(() => ({
  incomeSource: { findMany: vi.fn() },
  taxableEvent: { deleteMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  fiscalResidenceProfile: { findUnique: vi.fn() },
  deduction: { findMany: vi.fn() },
  exemption: { findMany: vi.fn() },
  asset: { findMany: vi.fn() },
  internationalTransfer: { findMany: vi.fn() },
  trustStructure: { findMany: vi.fn() },
  entitySimulation: { findMany: vi.fn() },
  monthlyTaxCalculation: { findMany: vi.fn(), upsert: vi.fn() },
  monthlyTaxCalculationItem: { deleteMany: vi.fn(), create: vi.fn() },
  taxCalculation: { findMany: vi.fn(), create: vi.fn() },
  capitalGainCalculation: { findMany: vi.fn() },
  taxReport: { create: vi.fn(), updateMany: vi.fn() },
  ruleOverride: { findMany: vi.fn() },
  conversationSession: { findFirst: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock("../db.js", () => ({
  prisma: prismaMock
}));

import { syncTaxableEvents, buildAndSaveReport } from "./tax-pipeline.js";

describe("tax pipeline intake to report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ruleOverride.findMany.mockResolvedValue([]);
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil",
      requiresAdditionalReview: false
    });
    prismaMock.deduction.findMany.mockResolvedValue([]);
    prismaMock.exemption.findMany.mockResolvedValue([]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.internationalTransfer.findMany.mockResolvedValue([]);
    prismaMock.trustStructure.findMany.mockResolvedValue([]);
    prismaMock.entitySimulation.findMany.mockResolvedValue([]);
    prismaMock.monthlyTaxCalculation.findMany.mockResolvedValue([]);
    prismaMock.capitalGainCalculation.findMany.mockResolvedValue([]);
    prismaMock.taxCalculation.findMany.mockResolvedValue([]);
    prismaMock.taxableEvent.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.taxableEvent.create.mockResolvedValue({});
    prismaMock.taxableEvent.createMany.mockResolvedValue({ count: 0 });
    prismaMock.monthlyTaxCalculation.upsert.mockResolvedValue({ id: "monthly-1" });
    prismaMock.monthlyTaxCalculationItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.monthlyTaxCalculationItem.create.mockResolvedValue({});
    prismaMock.taxCalculation.create.mockResolvedValue({});
    prismaMock.taxReport.create.mockResolvedValue({ id: "report-1" });
    prismaMock.taxReport.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.conversationSession.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<string>) =>
      fn(prismaMock)
    );
  });

  it("syncTaxableEvents links events to income row ids", async () => {
    const classified = classifyIncome(
      {
        payerName: "Client",
        originCountry: "US",
        incomeType: "consulting",
        grossAmount: 10000,
        originalCurrency: "USD",
        paymentDate: "2026-03-01",
        periodicity: "one_off",
        nature: "work"
      },
      "resident_brazil"
    );

    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "income-1",
        payerName: classified.payerName,
        originCountry: classified.originCountry,
        incomeType: classified.incomeType,
        grossAmount: { toNumber: () => classified.grossAmount },
        originalCurrency: classified.originalCurrency,
        paymentDate: new Date(classified.paymentDate),
        periodicity: classified.periodicity,
        taxPaidOriginCountry: null,
        withholdingTax: null,
        hasProofDocument: null,
        destinationAccountHint: null,
        transferredToBrazil: null,
        remainedAbroad: null,
        nature: classified.nature,
        notes: null,
        exchangeRateToBrl: null,
        grossAmountBrl: null,
        classification: classified.classification
      }
    ]);

    const count = await syncTaxableEvents("user-1", 2026);
    expect(count).toBe(1);
    expect(prismaMock.taxableEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ incomeSourceId: "income-1" })]
      })
    );
  });

  it("buildAndSaveReport runs recompute, estimate, and report inside a transaction", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      {
        id: "income-1",
        payerName: "Client",
        originCountry: "US",
        incomeType: "consulting",
        grossAmount: { toNumber: () => 10000 },
        originalCurrency: "USD",
        paymentDate: new Date("2026-03-01"),
        periodicity: "one_off",
        nature: "work",
        taxPaidOriginCountry: null,
        withholdingTax: null,
        hasProofDocument: null,
        destinationAccountHint: null,
        transferredToBrazil: null,
        remainedAbroad: null,
        notes: null,
        classification: { calculationModule: "carnet_leao" },
        exchangeRateToBrl: { toNumber: () => 5 },
        grossAmountBrl: { toNumber: () => 50000 }
      }
    ]);
    prismaMock.taxableEvent.findMany.mockResolvedValue([]);

    const reportId = await buildAndSaveReport("user-1", 2026);
    expect(reportId).toBe("report-1");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.taxReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          taxYear: 2026,
          ruleVersion: buildRuleVersionStamp(DATA_PACK_BR_2026)
        })
      })
    );

    const summary = buildTaxReportSummary({
      taxYear: 2026,
      fiscalProfile: "resident_brazil",
      incomes: [],
      events: [],
      deductions: [],
      monthly: [],
      capitalGains: [],
      annualTaxEstimates: [],
      requiresAdditionalReview: false
    });
    expect(summary.title).toContain("2026");
  });
});
