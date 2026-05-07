import { describe, expect, it } from "vitest";
import {
  isEventsSkipIntent,
  lastAssistantAskedEventNoneConfirmation
} from "./taxable-events-none.js";

describe("isEventsSkipIntent", () => {
  it("matches common no-event replies", () => {
    expect(isEventsSkipIntent("none")).toBe(true);
    expect(isEventsSkipIntent("no taxable events")).toBe(true);
    expect(isEventsSkipIntent("I don't have any taxable events")).toBe(true);
    expect(isEventsSkipIntent("there are none")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isEventsSkipIntent("which step are we")).toBe(false);
  });
});

describe("lastAssistantAskedEventNoneConfirmation", () => {
  it("detects assistant prompts asking user to confirm none", () => {
    const a =
      "Please let me know if you have any taxable events to report for the year 2026, or confirm if there are none.";
    expect(lastAssistantAskedEventNoneConfirmation(a)).toBe(true);
    const b =
      "If you don't have any, please confirm that as well!";
    expect(lastAssistantAskedEventNoneConfirmation(b)).toBe(true);
  });
});
