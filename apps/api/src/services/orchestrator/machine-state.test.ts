import { describe, expect, it } from "vitest";
import {
  ADVANCE_STATE_ENUM,
  allowedToolsForState,
  buildIntakeMachineState,
  INTAKE_PROMPT_VERSION
} from "./machine-state.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { CONVERSATION_STATES } from "@tax-platform/shared";

describe("intake machine state", () => {
  it("includes versioned next field and known answers for fiscal_residence", () => {
    const machine = buildIntakeMachineState(
      "fiscal_residence",
      2026,
      {
        _triagePending: false,
        intakeGoal: "full_annual",
        currentResidenceCountry: "US",
        nationalityCountry: "BR",
        _lastAskedKey: "physicallyLivesInBrazil"
      },
      {
        derivedProfile: "undetermined",
        needsCarnetLeao: true,
        needsCapitalGainStep: true,
        needsUsAnnual: false,
        skipMonthly: false,
        intakeGoal: "full_annual"
      }
    );

    expect(machine.promptVersion).toBe(INTAKE_PROMPT_VERSION);
    expect(machine.knownAnswers).toMatchObject({
      intakeGoal: "full_annual",
      currentResidenceCountry: "US",
      nationalityCountry: "BR"
    });
    expect(machine.knownAnswers).not.toHaveProperty("_lastAskedKey");
    expect(machine.nextField?.key).toBe("physicallyLivesInBrazil");
    expect(machine.missingFields).toContain("physicallyLivesInBrazil");
    expect(machine.allowedTools).toContain("submit_fiscal_residence");
    expect(machine.allowedTools).toContain("request_clarification");
  });

  it("scopes tools by conversation state", () => {
    expect(allowedToolsForState("income_capture")).toContain("submit_income_source");
    expect(allowedToolsForState("income_capture")).not.toContain("submit_fiscal_residence");
    expect(allowedToolsForState("patrimony")).toEqual(
      expect.arrayContaining([
        "advance_conversation_state",
        "request_clarification",
        "mark_complex_case"
      ])
    );
    expect(allowedToolsForState("patrimony")).not.toContain("submit_income_source");
  });

  it("aligns advance enum with CONVERSATION_STATES", () => {
    expect(ADVANCE_STATE_ENUM).toEqual(CONVERSATION_STATES);
    expect(ADVANCE_STATE_ENUM).toContain("patrimony");
    expect(ADVANCE_STATE_ENUM).toContain("transfers");
    expect(ADVANCE_STATE_ENUM).toContain("trust_registry");
    expect(ADVANCE_STATE_ENUM).toContain("entity_simulation");
  });

  it("system prompt embeds machine state instead of raw context dump", () => {
    const prompt = buildSystemPrompt(
      "fiscal_residence",
      2026,
      {
        currentResidenceCountry: "BR",
        nationalityCountry: "BR",
        noisyInternal: { deep: true },
        _secretFlag: true
      }
    );
    expect(prompt).toContain(INTAKE_PROMPT_VERSION);
    expect(prompt).toContain("Machine state:");
    expect(prompt).toContain('"nextField"');
    expect(prompt).not.toContain("_secretFlag");
    expect(prompt).not.toContain("Context so far:");
  });
});
