import { describe, expect, it } from "vitest";
import { inferFiscalFieldFromAssistantText } from "../fiscal-intake.js";
import { isFiscalClarificationQuestion, isLikelyOffTopicUserMessage } from "./intents.js";
import {
  resolveFiscalFieldBeingAsked,
  resolveFiscalFieldForUserAnswer
} from "./fiscal-orchestration.js";
import { buildFiscalClarifyReply } from "./handlers/fiscal-clarify.js";

const partialProfile = {
  _triagePending: false,
  intakeGoal: "full_annual",
  currentResidenceCountry: "BR",
  nationalityCountry: "BR",
  isFiscalResidentBrazil: true
};

describe("inferFiscalFieldFromAssistantText", () => {
  it("prefers the last question when a message contains two field prompts", () => {
    const text =
      "When is your birth date (YYYY-MM-DD)?\n\nAre you a fiscal resident of the United States? (yes/no)";
    const key = inferFiscalFieldFromAssistantText(text, [
      "isFiscalResidentUSA",
      "birthDate",
      "fullName"
    ]);
    expect(key).toBe("isFiscalResidentUSA");
  });
});

describe("resolveFiscalFieldForUserAnswer", () => {
  it("accepts birth date when assistant asked birth date out of order", () => {
    const assistant =
      "Thanks for confirming! When is your birth date? Please provide it in the format YYYY-MM-DD.";
    const key = resolveFiscalFieldForUserAnswer(partialProfile, "1988-01-01", assistant);
    expect(key).toBe("birthDate");
  });

  it("accepts full name when assistant asked for name out of order", () => {
    const assistant =
      "I appreciate your response! Finally, could you please provide your full name?";
    const key = resolveFiscalFieldForUserAnswer(
      { ...partialProfile, isFiscalResidentUSA: false, fiscalResidenceOtherCountry: false },
      "pedro alberto russo",
      assistant
    );
    expect(key).toBe("fullName");
  });

  it("accepts slash dates when assistant asked birth date", () => {
    const assistant =
      "What is your date of birth? Please use the format YYYY-MM-DD.";
    expect(resolveFiscalFieldForUserAnswer(partialProfile, "01/01/1988", assistant)).toBe("birthDate");
  });

  it("treats a date as birth date even if that field is already filled", () => {
    const assistant =
      "It seems the date format is incorrect. Please provide your date of birth using the format YYYY-MM-DD (for example, 1988-01-01).";
    const ctx = {
      ...partialProfile,
      physicallyLivesInBrazil: true,
      brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-04-01" }],
      isFiscalResidentUSA: false,
      fiscalResidenceOtherCountry: false,
      immigrationStatus: "none",
      hasCpf: true,
      birthDate: "1988-01-01",
      _lastAskedKey: "hasResidencePermit"
    };
    expect(resolveFiscalFieldForUserAnswer(ctx, "1988-01-01", assistant)).toBe("birthDate");
  });
});

describe("isLikelyOffTopicUserMessage fiscal_residence", () => {
  it("does not flag birth date answer when assistant asked birth date early", () => {
    const assistant =
      "Thanks for confirming! When is your birth date? Please provide it in the format YYYY-MM-DD.";
    const offTopic = isLikelyOffTopicUserMessage(
      "fiscal_residence",
      partialProfile,
      "1988-01-01",
      assistant
    );
    expect(offTopic).toBe(false);
  });

  it("does not flag full name answer when assistant asked for name early", () => {
    const assistant = "Finally, could you please provide your full name?";
    const offTopic = isLikelyOffTopicUserMessage(
      "fiscal_residence",
      { ...partialProfile, isFiscalResidentUSA: false, fiscalResidenceOtherCountry: false },
      "pedro alberto russo",
      assistant
    );
    expect(offTopic).toBe(false);
  });

  it("still flags unrelated chit-chat during fiscal intake", () => {
    const offTopic = isLikelyOffTopicUserMessage(
      "fiscal_residence",
      partialProfile,
      "who won the world cup",
      "Are you a fiscal resident of the United States? (yes/no)"
    );
    expect(offTopic).toBe(true);
  });

  it("does not flag a corrected ISO date as off-topic after a format retry", () => {
    const assistant =
      "It seems the date format is incorrect. Please provide your date of birth using the format YYYY-MM-DD (for example, 1988-01-01).";
    const offTopic = isLikelyOffTopicUserMessage(
      "fiscal_residence",
      {
        ...partialProfile,
        physicallyLivesInBrazil: true,
        brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-04-01" }],
        isFiscalResidentUSA: false,
        fiscalResidenceOtherCountry: false,
        hasCpf: true,
        birthDate: "1988-01-01",
        _lastAskedKey: "hasResidencePermit"
      },
      "1988-01-01",
      assistant
    );
    expect(offTopic).toBe(false);
  });

  it("does not flag explain as off-topic", () => {
    expect(isFiscalClarificationQuestion("explain")).toBe(true);
    const offTopic = isLikelyOffTopicUserMessage(
      "fiscal_residence",
      { ...partialProfile, _lastAskedKey: "immigrationStatus" },
      "explain",
      "Now, do you have any immigration status in Brazil? (yes/no)"
    );
    expect(offTopic).toBe(false);
  });
});

const coreAnswered = {
  ...partialProfile,
  physicallyLivesInBrazil: false,
  brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-01-20" }],
  isFiscalResidentUSA: false,
  fiscalResidenceOtherCountry: false
};

describe("resolveFiscalFieldBeingAsked", () => {
  it("prefers last asked immigration over first pending map field", () => {
    const key = resolveFiscalFieldBeingAsked(
      { ...coreAnswered, _lastAskedKey: "immigrationStatus" },
      "Now, do you have any immigration status in Brazil? (yes/no)"
    );
    expect(key).toBe("immigrationStatus");
  });
});

describe("buildFiscalClarifyReply", () => {
  it("explains immigration status instead of skipping to first entry", () => {
    const text = buildFiscalClarifyReply(
      { ...coreAnswered, _lastAskedKey: "immigrationStatus" },
      "Now, do you have any immigration status in Brazil? (yes/no)"
    );
    expect(text).toMatch(/immigration category/i);
    expect(text).toMatch(/tourist/i);
    expect(text).not.toMatch(/keep this focused/i);
    expect(text).not.toMatch(/first entry/i);
  });
});
