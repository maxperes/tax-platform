import { describe, expect, it } from "vitest";
import {
  MAX_BRAZIL_STAYS,
  collectBrazilStaysFromInterview,
  countPresenceDaysFromStays,
  syncBrazilStaysToInterviewAnswers
} from "./brazil-stays.js";
import { emptyInterviewRecord } from "./interview-record.js";

describe("brazil-stays helpers", () => {
  it("collects stays from trip keys with open last stay", () => {
    const record = emptyInterviewRecord();
    record.answers.currently_in_brazil = "yes";
    record.answers.brazil_trip_count = "2";
    record.answers.brazil_trip_1_entry = "2025-09-01";
    record.answers.brazil_trip_1_exit = "2025-12-09";
    record.answers.brazil_trip_2_entry = "2026-01-01";
    expect(collectBrazilStaysFromInterview(record)).toEqual([
      { entryDate: "2025-09-01", exitDate: "2025-12-09" },
      { entryDate: "2026-01-01" }
    ]);
  });

  it("syncs stays back to interview keys", () => {
    const patch = syncBrazilStaysToInterviewAnswers(
      [{ entryDate: "2024-01-01", exitDate: "2024-03-01" }],
      false
    );
    expect(patch.brazil_trip_count).toBe("1");
    expect(patch.brazil_trip_1_entry).toBe("2024-01-01");
    expect(patch.brazil_trip_1_exit).toBe("2024-03-01");
  });

  it("clears a previously set exit date when omitted", () => {
    const patch = syncBrazilStaysToInterviewAnswers([{ entryDate: "2024-01-01" }], true);
    expect(patch.brazil_trip_1_entry).toBe("2024-01-01");
    expect(patch.brazil_trip_1_exit).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patch, "brazil_trip_1_exit")).toBe(true);
  });

  it("counts inclusive presence days", () => {
    const days = countPresenceDaysFromStays(
      [{ entryDate: "2026-01-01", exitDate: "2026-01-03" }],
      "2026-01-03"
    );
    expect(days).toBe(3);
  });

  it("supports up to MAX_BRAZIL_STAYS", () => {
    expect(MAX_BRAZIL_STAYS).toBeGreaterThanOrEqual(12);
  });
});
