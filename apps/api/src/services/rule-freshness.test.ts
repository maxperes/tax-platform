import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkRulesFreshness } from "./rule-freshness.js";

const prismaMock = vi.hoisted(() => ({
  fiscalResidenceProfile: { findUnique: vi.fn() },
  monthlyTaxCalculation: { findMany: vi.fn() },
  taxCalculation: { findMany: vi.fn() },
  taxReport: { findFirst: vi.fn() },
  capitalGainCalculation: { findMany: vi.fn() },
  ruleOverride: { findMany: vi.fn() }
}));

vi.mock("../db.js", () => ({ prisma: prismaMock }));

describe("checkRulesFreshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.fiscalResidenceProfile.findUnique.mockResolvedValue({
      derivedProfile: "resident_brazil"
    });
    prismaMock.ruleOverride.findMany.mockResolvedValue([]);
    prismaMock.monthlyTaxCalculation.findMany.mockResolvedValue([]);
    prismaMock.taxCalculation.findMany.mockResolvedValue([]);
    prismaMock.taxReport.findFirst.mockResolvedValue(null);
    prismaMock.capitalGainCalculation.findMany.mockResolvedValue([]);
  });

  it("reports up to date when no stored calculations exist", async () => {
    const result = await checkRulesFreshness("user-1", 2026);
    expect(result.isRulesOutdated).toBe(false);
    expect(result.currentRuleVersion).toContain("br-2026-1");
    expect(result.taxYearSupported).toBe(true);
  });

  it("flags outdated report when ruleVersion differs", async () => {
    prismaMock.taxReport.findFirst.mockResolvedValue({
      ruleVersion: "engine@0.0.0+data@br-2025-1"
    });
    const result = await checkRulesFreshness("user-1", 2026);
    expect(result.isRulesOutdated).toBe(true);
    expect(result.outdatedSources).toContain("report");
  });
});
