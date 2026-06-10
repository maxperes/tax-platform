import { isTaxYearSupported, jurisdictionsForProfile, resolvePackTaxYear } from "@tax-platform/rules";
import type { FiscalProfile } from "@tax-platform/shared";
import { prisma } from "../db.js";
import {
  buildBrRuleStamp,
  buildRuleVersionForJurisdictions,
  buildUsRuleStamp,
  loadRulePatches
} from "./rule-overrides.js";

export type RulesFreshnessSource = "monthly" | "annual" | "report" | "capital_gain";

export type RulesFreshnessResult = {
  taxYear: number;
  packTaxYear: number;
  taxYearSupported: boolean;
  currentRuleVersion: string;
  storedRuleVersions: {
    monthly?: string;
    annual?: string[];
    report?: string;
    capitalGain?: string[];
  };
  isRulesOutdated: boolean;
  outdatedSources: RulesFreshnessSource[];
};

function stampDiffers(stored: string | undefined | null, current: string): boolean {
  return Boolean(stored && stored !== current);
}

export async function checkRulesFreshness(userId: string, taxYear: number): Promise<RulesFreshnessResult> {
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurisdictions = jurisdictionsForProfile(profile);
  const brPatches = jurisdictions.includes("BR") ? await loadRulePatches("BR", taxYear) : [];
  const usPatches = jurisdictions.includes("US") ? await loadRulePatches("US", taxYear) : [];
  const brStamp = buildBrRuleStamp(taxYear, brPatches);
  const usStamp = buildUsRuleStamp(taxYear, usPatches);
  const currentRuleVersion = buildRuleVersionForJurisdictions(taxYear, jurisdictions, brPatches, usPatches);

  const [monthlyRows, annualRows, latestReport, capitalGainRows] = await Promise.all([
    prisma.monthlyTaxCalculation.findMany({
      where: { userId, taxYear },
      select: { ruleVersion: true },
      take: 1
    }),
    prisma.taxCalculation.findMany({
      where: { userId, taxYear },
      orderBy: { createdAt: "desc" },
      select: { jurisdiction: true, ruleVersion: true }
    }),
    prisma.taxReport.findFirst({
      where: { userId, taxYear, isStale: false },
      orderBy: { createdAt: "desc" },
      select: { ruleVersion: true }
    }),
    prisma.capitalGainCalculation.findMany({
      where: { userId, taxYear },
      select: { ruleVersion: true, jurisdiction: true },
      take: 10
    })
  ]);

  const storedRuleVersions: RulesFreshnessResult["storedRuleVersions"] = {};
  const outdatedSources: RulesFreshnessSource[] = [];

  if (monthlyRows[0]?.ruleVersion) {
    storedRuleVersions.monthly = monthlyRows[0].ruleVersion;
    if (jurisdictions.includes("BR") && stampDiffers(monthlyRows[0].ruleVersion, brStamp)) {
      outdatedSources.push("monthly");
    }
  }

  const annualByJurisdiction = new Map<string, string>();
  for (const row of annualRows) {
    if (!annualByJurisdiction.has(row.jurisdiction)) {
      annualByJurisdiction.set(row.jurisdiction, row.ruleVersion);
    }
  }
  if (annualByJurisdiction.size) {
    storedRuleVersions.annual = [...annualByJurisdiction.values()];
    for (const [jur, stamp] of annualByJurisdiction) {
      const jurCurrent =
        jurisdictions.length === 1
          ? currentRuleVersion
          : jur === "US"
            ? currentRuleVersion.split("+")[1]
            : currentRuleVersion.split("+")[0];
      if (jurCurrent && stampDiffers(stamp, jurCurrent)) {
        outdatedSources.push("annual");
        break;
      }
    }
  }

  if (latestReport?.ruleVersion) {
    storedRuleVersions.report = latestReport.ruleVersion;
    if (stampDiffers(latestReport.ruleVersion, currentRuleVersion)) {
      outdatedSources.push("report");
    }
  }

  const capStamps = [...new Set(capitalGainRows.map((r) => r.ruleVersion))];
  if (capStamps.length) {
    storedRuleVersions.capitalGain = capStamps;
    for (const row of capitalGainRows) {
      const expected = row.jurisdiction === "US" ? usStamp : brStamp;
      if (stampDiffers(row.ruleVersion, expected)) {
        outdatedSources.push("capital_gain");
        break;
      }
    }
  }

  return {
    taxYear,
    packTaxYear: resolvePackTaxYear(taxYear),
    taxYearSupported: isTaxYearSupported(taxYear),
    currentRuleVersion,
    storedRuleVersions,
    isRulesOutdated: outdatedSources.length > 0,
    outdatedSources: [...new Set(outdatedSources)]
  };
}
