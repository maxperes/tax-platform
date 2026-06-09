import { describe, expect, it } from "vitest";
import { buildStampWithOverrides, computeRuleOverrideFingerprint } from "./rule-overrides.js";
import { DATA_PACK_BR_2026, ENGINE_VERSION } from "@tax-platform/shared";

describe("rule override version stamps", () => {
  it("returns base stamp when no patches", () => {
    expect(buildStampWithOverrides(DATA_PACK_BR_2026, [])).toBe(
      `engine@${ENGINE_VERSION}+data@${DATA_PACK_BR_2026}`
    );
  });

  it("includes stable override fingerprint when patches exist", () => {
    const patches = [{ key: "lei14754Rate", value: 0.1 }];
    const fp = computeRuleOverrideFingerprint(patches);
    expect(fp).toHaveLength(12);
    expect(buildStampWithOverrides(DATA_PACK_BR_2026, patches)).toBe(
      `engine@${ENGINE_VERSION}+data@${DATA_PACK_BR_2026}+overrides@${fp}`
    );
  });
});
