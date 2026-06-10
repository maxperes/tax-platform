import { describe, expect, it } from "vitest";
import { DATA_PACK_BR_2026, ENGINE_VERSION } from "@tax-platform/shared";
import {
  buildBrRuleStamp,
  buildRuleVersionForJurisdictions,
  buildStampWithOverrides,
  computeRuleOverrideFingerprint
} from "./rule-overrides.js";

describe("buildStampWithOverrides", () => {
  it("returns base stamp without patches", () => {
    expect(buildStampWithOverrides(DATA_PACK_BR_2026, [])).toBe(
      `engine@${ENGINE_VERSION}+data@${DATA_PACK_BR_2026}`
    );
  });

  it("appends override fingerprint when patches present", () => {
    const patches = [{ key: "br.lei14754Rate", value: 0.14 }];
    const fp = computeRuleOverrideFingerprint(patches);
    expect(buildStampWithOverrides(DATA_PACK_BR_2026, patches)).toBe(
      `engine@${ENGINE_VERSION}+data@${DATA_PACK_BR_2026}+overrides@${fp}`
    );
  });
});

describe("buildRuleVersionForJurisdictions", () => {
  it("builds BR-only stamp", () => {
    const stamp = buildRuleVersionForJurisdictions(2026, ["BR"], [], []);
    expect(stamp).toBe(buildBrRuleStamp(2026, []));
    expect(stamp).toContain("data@br-2026-1");
  });

  it("combines BR and US for dual profile", () => {
    const stamp = buildRuleVersionForJurisdictions(2026, ["BR", "US"], [], []);
    expect(stamp).toContain("+");
    expect(stamp).toContain("br-2026-1");
    expect(stamp).toContain("us-2026-1");
  });
});
