import { describe, expect, it } from "vitest";
import {
  BR_RESID_001_META,
  enumerateStayDays,
  evaluateBrResid001,
  firstDayExceeding183,
  isResidentOn,
  presenceDaysFromStays
} from "./br-resid-001.js";
import { computeBrazilianResidencyStart } from "../../engines/residency-start.js";
import { getBrLegalRules } from "../packs/br-2026.js";

describe("BR-RESID-001", () => {
  it("exposes rule metadata consumed by BR-IRPF-EXT-001", () => {
    expect(BR_RESID_001_META.id).toBe("BR-RESID-001");
    expect(BR_RESID_001_META.ePressupostoDe).toContain("BR-IRPF-EXT-001");
    expect(getBrLegalRules().some((rule) => rule.id === "BR-RESID-001")).toBe(true);
  });

  it("starts residency on the 184th consecutive day (non-leap year)", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "temporary_visa",
        brazilStays: [{ entryDate: "2026-01-01" }]
      },
      "2026-07-03"
    );
    expect(result.method).toBe("183_days");
    expect(result.rollingWindowApplied).toBe(true);
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-07-03");
    expect(result.presenceDaysCounted).toBe(184);
    expect(isResidentOn(result, "2026-07-03")).toBe(true);
    expect(isResidentOn(result, "2026-07-02")).toBe(false);
  });

  it("does not start on the 183rd consecutive day", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "digital_nomad",
        brazilStays: [{ entryDate: "2026-01-01" }]
      },
      "2026-07-02"
    );
    expect(result.brazilianTaxResidencyStartDate).toBeNull();
    expect(result.method).toBe("undetermined");
    expect(result.presenceDaysCounted).toBe(183);
  });

  it("uses a leap-year calendar for consecutive presence", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "temporary_visa",
        brazilStays: [{ entryDate: "2024-01-01" }]
      },
      "2024-07-02"
    );
    expect(result.brazilianTaxResidencyStartDate).toBe("2024-07-02");
  });

  it("counts non-consecutive stays inside a rolling 12-month window", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "other",
        brazilStays: [
          { entryDate: "2025-09-01", exitDate: "2025-12-09" },
          { entryDate: "2026-01-01", exitDate: "2026-03-31" }
        ]
      },
      "2026-03-31"
    );
    expect(result.method).toBe("183_days");
    expect(result.rollingWindowApplied).toBe(true);
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-03-25");
  });

  it("does not treat 180 days in a 12-month window as residency", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "temporary_visa",
        brazilStays: [
          { entryDate: "2025-10-01", exitDate: "2025-12-29" },
          { entryDate: "2026-01-01", exitDate: "2026-03-31" }
        ]
      },
      "2026-03-31"
    );
    expect(result.brazilianTaxResidencyStartDate).toBeNull();
    expect(result.method).toBe("undetermined");
  });

  it("does not double-count overlapping stays", () => {
    const days = presenceDaysFromStays(
      [
        { entryDate: "2026-01-01", exitDate: "2026-01-10" },
        { entryDate: "2026-01-05", exitDate: "2026-01-12" }
      ],
      "2026-12-31"
    );
    expect(days).toHaveLength(12);
    expect(days[0]).toBe("2026-01-01");
    expect(days[11]).toBe("2026-01-12");
  });

  it("falls back to first-entry plus 183 days when only a day band is available", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "temporary_visa",
        firstEntryBrazilDate: "2026-03-01",
        daysInBrazilCalendarYear: 200
      },
      "2026-12-31"
    );
    expect(result.rollingWindowApplied).toBe(false);
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-08-31");
    expect(result.notes.some((note) => /not the statutory rolling/.test(note))).toBe(true);
  });

  it("does not let a day band override stay history that stays under 183", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "temporary_visa",
        firstEntryBrazilDate: "2026-03-01",
        daysInBrazilCalendarYear: 200,
        brazilStays: [{ entryDate: "2026-03-01", exitDate: "2026-03-20" }]
      },
      "2026-12-31"
    );
    expect(result.brazilianTaxResidencyStartDate).toBeNull();
    expect(result.rollingWindowApplied).toBe(true);
  });

  it("keeps permanent-visa start on entry even when presence exceeds 183 days", () => {
    const result = evaluateBrResid001(
      {
        entryPathway: "permanent_visa",
        firstEntryBrazilDate: "2026-03-01",
        brazilStays: [{ entryDate: "2026-03-01" }]
      },
      "2026-12-31"
    );
    expect(result.method).toBe("permanent_visa");
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-03-01");
    expect(result.rollingWindowApplied).toBe(false);
  });

  it("wires the rolling result through computeBrazilianResidencyStart", () => {
    const result = computeBrazilianResidencyStart(
      {
        entryPathway: "temporary_visa",
        brazilStays: [{ entryDate: "2026-01-01" }]
      },
      "2026-07-03"
    );
    expect(result.method).toBe("183_days");
    expect(result.brazilianTaxResidencyStartDate).toBe("2026-07-03");
    expect(result.reliability.ruleIds).toContain("BR-RESID-001");
    expect(result.notes.some((note) => /BR-RESID-001/.test(note))).toBe(true);
  });

  it("enumerates inclusive stay days and finds no 184th day in a short list", () => {
    expect(enumerateStayDays({ entryDate: "2026-01-01", exitDate: "2026-01-03" }, "2026-12-31")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03"
    ]);
    expect(firstDayExceeding183(["2026-01-01", "2026-01-02"])).toBeNull();
  });
});
