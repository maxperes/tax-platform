import { describe, expect, it } from "vitest";
import {
  inferredUsFilingStatus,
  isDomainStepSkipIntent,
  isEventsConfirmIntent,
  parseIntakeGoal,
  parseUsFilingInputs,
  triagePromptText,
  usFilingPromptText
} from "./intake-helpers.js";
import { isTrustOrComplianceConcern } from "./orchestrator/intents.js";

describe("triagePromptText", () => {
  it("asks for a numbered choice instead of option ids", () => {
    const text = triagePromptText();
    expect(text).toMatch(/Reply with \*\*1\*\*, \*\*2\*\*, \*\*3\*\*, or \*\*4\*\*/);
    expect(text).toMatch(/^1\. Foreign salary/m);
    expect(text).toMatch(/^4\. Full annual tax picture/m);
    expect(text).not.toMatch(/foreign_salary/);
  });
});

describe("parseIntakeGoal", () => {
  it("accepts 1–4", () => {
    expect(parseIntakeGoal("1")).toBe("foreign_salary");
    expect(parseIntakeGoal("2")).toBe("investments");
    expect(parseIntakeGoal("3")).toBe("asset_sale");
    expect(parseIntakeGoal("4")).toBe("full_annual");
    expect(parseIntakeGoal("option 2")).toBe("investments");
    expect(parseIntakeGoal("3.")).toBe("asset_sale");
    expect(parseIntakeGoal("1. Foreign salary or freelance paid abroad")).toBe("foreign_salary");
  });

  it("still accepts option ids and natural language", () => {
    expect(parseIntakeGoal("foreign_salary")).toBe("foreign_salary");
    expect(parseIntakeGoal("full_annual")).toBe("full_annual");
    expect(parseIntakeGoal("foreign salary paid abroad")).toBe("foreign_salary");
  });

  it("does not treat unrelated numbers as a choice", () => {
    expect(parseIntakeGoal("12")).toBeUndefined();
    expect(parseIntakeGoal("0")).toBeUndefined();
    expect(parseIntakeGoal("5")).toBeUndefined();
  });
});

describe("usFilingPromptText", () => {
  it("asks a numbered choice without acronyms", () => {
    const text = usFilingPromptText();
    expect(text).toMatch(/Reply with \*\*1[–-]4\*\*/);
    expect(text).toMatch(/^1\. Single/m);
    expect(text).toMatch(/^4\. Not sure/m);
    expect(text).not.toMatch(/FEIE|NII|mfj|hoh/);
  });

  it("asks jointly yes/no when marital status is married", () => {
    const text = usFilingPromptText({ maritalStatus: "married" });
    expect(text).toMatch(/jointly with your spouse/i);
    expect(text).toMatch(/yes/i);
    expect(text).not.toMatch(/FEIE/);
  });
});

describe("inferredUsFilingStatus", () => {
  it("maps unmarried statuses to single", () => {
    expect(inferredUsFilingStatus({ maritalStatus: "single" })).toBe("single");
    expect(inferredUsFilingStatus({ maritalStatus: "divorced" })).toBe("single");
    expect(inferredUsFilingStatus({ fiscalResidence: { maritalStatus: "widowed" } })).toBe("single");
  });

  it("does not infer for married or unknown", () => {
    expect(inferredUsFilingStatus({ maritalStatus: "married" })).toBeUndefined();
    expect(inferredUsFilingStatus({ maritalStatus: "stable_union" })).toBeUndefined();
    expect(inferredUsFilingStatus({})).toBeUndefined();
  });
});

describe("parseUsFilingInputs", () => {
  it("parses numbered choices and plain language", () => {
    expect(parseUsFilingInputs("single")).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("2")).toEqual({
      filingStatus: "mfj",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("married")).toEqual({
      filingStatus: "mfj",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("4")).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("not sure")).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
  });

  it("still accepts optional FEIE/NII amounts if the user types them", () => {
    expect(parseUsFilingInputs("single, FEIE 10k usd")).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 10_000,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("mfj FEIE 120000 NII 2.5k")).toEqual({
      filingStatus: "mfj",
      foreignEarnedIncomeUsd: 120_000,
      netInvestmentIncomeUsd: 2_500
    });
  });

  it("treats yes/no as jointly when marital status is married", () => {
    const married = { maritalStatus: "married" };
    expect(parseUsFilingInputs("yes", married)).toEqual({
      filingStatus: "mfj",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
    expect(parseUsFilingInputs("no", married)).toEqual({
      filingStatus: "single",
      foreignEarnedIncomeUsd: 0,
      netInvestmentIncomeUsd: 0
    });
  });

  it("returns undefined without a filing status", () => {
    expect(parseUsFilingInputs("FEIE 10k")).toBeUndefined();
    expect(parseUsFilingInputs("yes")).toBeUndefined();
  });
});

describe("isDomainStepSkipIntent", () => {
  it("accepts clear skip utterances", () => {
    expect(isDomainStepSkipIntent("no")).toBe(true);
    expect(isDomainStepSkipIntent("none")).toBe(true);
    expect(isDomainStepSkipIntent("skip this step")).toBe(true);
    expect(isDomainStepSkipIntent("nothing to add")).toBe(true);
    expect(isDomainStepSkipIntent("I don't have any")).toBe(true);
  });

  it("does not skip on mid-sentence no", () => {
    expect(
      isDomainStepSkipIntent("I have no foreign property but own a house in Brazil")
    ).toBe(false);
    expect(isDomainStepSkipIntent("I don't have foreign property abroad")).toBe(false);
  });
});

describe("isEventsConfirmIntent", () => {
  it("accepts short confirmations", () => {
    expect(isEventsConfirmIntent("yes")).toBe(true);
    expect(isEventsConfirmIntent("looks correct")).toBe(true);
    expect(isEventsConfirmIntent("next step")).toBe(true);
  });

  it("does not advance on continue-in-prose", () => {
    expect(isEventsConfirmIntent("I want to continue fixing income amounts")).toBe(false);
  });
});

describe("isTrustOrComplianceConcern", () => {
  it("matches privacy framing", () => {
    expect(isTrustOrComplianceConcern("is my data private?")).toBe(true);
    expect(isTrustOrComplianceConcern("do you store this securely?")).toBe(true);
    expect(isTrustOrComplianceConcern("LGPD consent")).toBe(true);
  });

  it("does not steal ordinary intake verbs", () => {
    expect(isTrustOrComplianceConcern("please save this amount")).toBe(false);
    expect(isTrustOrComplianceConcern("delete the second income row")).toBe(false);
  });
});
