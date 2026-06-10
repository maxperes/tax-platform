import { createHash } from "node:crypto";
import { buildRuleVersionStamp } from "@tax-platform/shared";
import {
  jurisdictionsForProfile,
  resolveBrDataPackId,
  resolveUsDataPackId,
  type JurisdictionCode
} from "@tax-platform/rules";
import type { FiscalProfile } from "@tax-platform/shared";
import { prisma } from "../db.js";

export type RulePatch = { key: string; value: unknown };

export async function loadRulePatches(jurisdiction: "BR" | "US", taxYear: number): Promise<RulePatch[]> {
  const rows = await prisma.ruleOverride.findMany({
    where: { jurisdiction, taxYear }
  });
  return rows.map((r) => ({ key: r.key, value: r.valueJson as unknown }));
}

/** Stable short fingerprint for active RuleOverride rows (audit trail). */
export function computeRuleOverrideFingerprint(patches: RulePatch[]): string | undefined {
  if (!patches.length) return undefined;
  const sorted = [...patches].sort((a, b) => a.key.localeCompare(b.key));
  const payload = JSON.stringify(sorted);
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

export function buildStampWithOverrides(dataPackId: string, patches: RulePatch[]): string {
  return buildRuleVersionStamp(dataPackId, computeRuleOverrideFingerprint(patches));
}

export function buildBrRuleStamp(taxYear: number, patches: RulePatch[]): string {
  return buildStampWithOverrides(resolveBrDataPackId(taxYear), patches);
}

export function buildUsRuleStamp(taxYear: number, patches: RulePatch[]): string {
  return buildStampWithOverrides(resolveUsDataPackId(taxYear), patches);
}

export function buildRuleVersionForJurisdictions(
  taxYear: number,
  jurisdictions: JurisdictionCode[],
  brPatches: RulePatch[],
  usPatches: RulePatch[]
): string {
  if (jurisdictions.includes("BR") && jurisdictions.includes("US")) {
    return `${buildBrRuleStamp(taxYear, brPatches)}+${buildUsRuleStamp(taxYear, usPatches)}`;
  }
  if (jurisdictions.includes("US")) {
    return buildUsRuleStamp(taxYear, usPatches);
  }
  return buildBrRuleStamp(taxYear, brPatches);
}

export async function buildCurrentRuleVersion(
  taxYear: number,
  profile: FiscalProfile
): Promise<string> {
  const jurisdictions = jurisdictionsForProfile(profile);
  const brPatches = jurisdictions.includes("BR") ? await loadRulePatches("BR", taxYear) : [];
  const usPatches = jurisdictions.includes("US") ? await loadRulePatches("US", taxYear) : [];
  return buildRuleVersionForJurisdictions(taxYear, jurisdictions, brPatches, usPatches);
}

export const RULE_OVERRIDE_KEYS = {
  BR: ["br.monthly", "br.annual", "br.lei14754Rate"],
  US: ["us.brackets.single", "us.brackets.mfj", "us.feieLimit"]
} as const;

export function isAllowedRuleOverrideKey(jurisdiction: "BR" | "US", key: string): boolean {
  return (RULE_OVERRIDE_KEYS[jurisdiction] as readonly string[]).includes(key);
}
