import type { LegalRule, ReliabilityStamp, CertaintyTier } from "@tax-platform/shared";

export function isRuleInForce(rule: LegalRule, asOfDate: string): boolean {
  if (rule.effectiveFrom > asOfDate) return false;
  if (rule.repealedOn && rule.repealedOn <= asOfDate) return false;
  return true;
}

export function stampFromRules(
  conclusion: string,
  rules: LegalRule[]
): ReliabilityStamp {
  if (rules.length === 0) {
    return {
      conclusion,
      ruleIds: [],
      sourcesSummary: "No matched rule",
      certaintyTier: "contested",
      dependsOnCosit: false
    };
  }

  const certaintyTier: CertaintyTier[] = rules.map((r) => r.certaintyTier);
  const worst = worstCertainty(certaintyTier);
  const cites = rules.flatMap((r) => r.sources.map((s) => s.citation));
  const uniqueCites = [...new Set(cites)];

  return {
    conclusion,
    ruleIds: rules.map((r) => r.id),
    sourcesSummary: uniqueCites.slice(0, 4).join("; "),
    certaintyTier: worst,
    dependsOnCosit: rules.some((r) => r.dependsOnCosit)
  };
}

const TIER_RANK: Record<CertaintyTier, number> = {
  very_high: 0,
  high: 1,
  medium: 2,
  low: 3,
  contested: 4
};

function worstCertainty(tiers: CertaintyTier[]): CertaintyTier {
  return tiers.reduce((acc, t) => (TIER_RANK[t] > TIER_RANK[acc] ? t : acc), tiers[0] ?? "contested");
}

export function findRulesByTag(rules: LegalRule[], tag: string, asOfDate: string): LegalRule[] {
  return rules.filter((r) => r.tags.includes(tag) && isRuleInForce(r, asOfDate));
}
