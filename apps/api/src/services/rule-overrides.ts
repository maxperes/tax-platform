import { createHash } from "node:crypto";
import { buildRuleVersionStamp } from "@tax-platform/shared";
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
