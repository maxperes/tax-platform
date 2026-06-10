import { describe, expect, it } from "vitest";
import { inferFiscalFieldFromAssistantText } from "../fiscal-intake.js";
import { isLikelyOffTopicUserMessage } from "./intents.js";
import { resolveFiscalFieldForUserAnswer } from "./fiscal-orchestration.js";

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

  it("uses _lastAskedKey for yes/no when multiple booleans are pending", () => {
    const ctx = { ...partialProfile, _lastAskedKey: "isFiscalResidentUSA" };
    const key = resolveFiscalFieldForUserAnswer(ctx, "yes");
    expect(key).toBe("isFiscalResidentUSA");
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
});
