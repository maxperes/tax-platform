import { describe, expect, it } from "vitest";
import { parseRewindTargetStep } from "./conversation-rewind.js";

describe("parseRewindTargetStep", () => {
  it("parses go back to income from complete", () => {
    expect(parseRewindTargetStep("go back to income")).toBe("income_capture");
  });

  it("parses update deductions", () => {
    expect(parseRewindTargetStep("I need to update my deductions")).toBe("deductions");
  });

  it("returns null without navigation intent", () => {
    expect(parseRewindTargetStep("my income was wrong")).toBeNull();
  });

  it("returns null for unrelated text", () => {
    expect(parseRewindTargetStep("hello")).toBeNull();
  });
});
