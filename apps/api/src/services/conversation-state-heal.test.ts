import { describe, expect, it } from "vitest";
import {
  healStateIfAssistantAnnouncedLaterStep,
  normalizeForwardAdvance
} from "./conversation-state-heal.js";

describe("healStateIfAssistantAnnouncedLaterStep", () => {
  it("returns deductions when prose moves from events to deductions", () => {
    const text =
      "Great! Let's move on to deductions. Please provide the first type of deduction you would like to claim.";
    expect(healStateIfAssistantAnnouncedLaterStep(text, "events")).toBe("deductions");
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
  it("accepts deductions to capital_gain", () => {
    expect(normalizeForwardAdvance("deductions", "capital_gain")).toBe("capital_gain");
  });
  it("rejects same state", () => {
    expect(normalizeForwardAdvance("events", "events")).toBeNull();
  });
});
