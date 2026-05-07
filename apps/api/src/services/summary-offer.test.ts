import { describe, expect, it } from "vitest";
import {
  assistantAcknowledgesNoTaxableEvents,
  isExplicitGenerateReportIntent,
  lastAssistantOfferedSummary
} from "./summary-offer.js";

describe("lastAssistantOfferedSummary", () => {
  it("detects summarize offers", () => {
    expect(
      lastAssistantOfferedSummary(
        "You have completed the intake process. Would you like me to summarize the information collected?"
      )
    ).toBe(true);
  });

  it("detects report step + summary phrasing", () => {
    expect(
      lastAssistantOfferedSummary(
        "Let's proceed to the **report** step. Would you like a summary of your provided information before we finalize?"
      )
    ).toBe(true);
  });

  it("detects final step + report + would you like", () => {
    expect(
      lastAssistantOfferedSummary(
        "Would you like me to proceed to the next and final step, which is the report?"
      )
    ).toBe(true);
  });

  it("returns false for unrelated assistant text", () => {
    expect(lastAssistantOfferedSummary("What is your employer name?")).toBe(false);
  });
});

describe("isExplicitGenerateReportIntent", () => {
  it("matches direct report commands", () => {
    expect(isExplicitGenerateReportIntent("generate the report")).toBe(true);
    expect(isExplicitGenerateReportIntent("Please build the report")).toBe(true);
    expect(isExplicitGenerateReportIntent("run report")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(isExplicitGenerateReportIntent("yes")).toBe(false);
  });

  it("matches conversational regenerate asks", () => {
    expect(isExplicitGenerateReportIntent("can you generate again?")).toBe(true);
    expect(isExplicitGenerateReportIntent("please regenerate the report")).toBe(true);
  });

  it("matches summary phrasing and common typos from Done", () => {
    expect(isExplicitGenerateReportIntent("generae new summary")).toBe(true);
    expect(isExplicitGenerateReportIntent("please generate a new summary")).toBe(true);
    expect(isExplicitGenerateReportIntent("another summary please")).toBe(true);
    expect(isExplicitGenerateReportIntent("refresh the report")).toBe(true);
  });
});

describe("assistantAcknowledgesNoTaxableEvents", () => {
  it("matches common confirmations", () => {
    expect(
      assistantAcknowledgesNoTaxableEvents(
        "We've already confirmed that there are no taxable events you'd like to report for 2026."
      )
    ).toBe(true);
  });
});
