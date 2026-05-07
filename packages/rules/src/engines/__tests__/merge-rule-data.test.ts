import { describe, expect, it } from "vitest";
import { applyJsonPatchesToBrPack } from "../../merge-rule-data.js";
import { brRulePack2026 } from "../../data/br/2026.js";

describe("applyJsonPatchesToBrPack", () => {
  it("overrides lei14754Rate when patch present", () => {
    const merged = applyJsonPatchesToBrPack(brRulePack2026, [{ key: "br.lei14754Rate", value: 0.14 }]);
    expect(merged.lei14754Rate).toBe(0.14);
    expect(brRulePack2026.lei14754Rate).not.toBe(0.14);
  });
});
