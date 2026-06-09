import { describe, expect, it } from "vitest";
import {
  healStateIfAssistantAnnouncedLaterStep,
  normalizeForwardAdvance
} from "./conversation-state-heal.js";

describe("healStateIfAssistantAnnouncedLaterStep", () => {
  it("returns capital_gain when prose moves from events to capital gains", () => {
    const text = "Great! Let's move on to capital gains. Describe one asset sale at a time.";
    expect(healStateIfAssistantAnnouncedLaterStep(text, "events")).toBe("capital_gain");
  });

  it("does not change fiscal_residence", () => {
    const text = "Let's move on to deductions.";
    expect(healStateIfAssistantAnnouncedLaterStep(text, "fiscal_residence")).toBeNull();
  });

  it("does not go backwards from deductions to events", () => {
    const text = "Let's move on to taxable events.";
    expect(healStateIfAssistantAnnouncedLaterStep(text, "deductions")).toBeNull();
  });

  it("returns null when prose is unrelated", () => {
    expect(healStateIfAssistantAnnouncedLaterStep("Tell me a joke.", "events")).toBeNull();
  });
});

describe("normalizeForwardAdvance", () => {
  it("rejects backwards from deductions to events", () => {
    expect(normalizeForwardAdvance("deductions", "events")).toBeNull();
  });
  it("accepts capital_gain to deductions", () => {
    expect(normalizeForwardAdvance("capital_gain", "deductions")).toBe("deductions");
  });
  it("rejects same state", () => {
    expect(normalizeForwardAdvance("events", "events")).toBeNull();
  });
});
