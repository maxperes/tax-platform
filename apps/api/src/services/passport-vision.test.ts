import { describe, expect, it } from "vitest";
import { parsePassportVisionResponse } from "./passport-vision.js";

describe("parsePassportVisionResponse", () => {
  it("parses JSON with brazil stays", () => {
    const raw = JSON.stringify({
      brazilStays: [
        {
          entryDate: "2024-03-01",
          exitDate: "2024-06-15",
          confidence: "high",
          rawText: "ENTRADA 01/03/2024"
        },
        {
          entryDate: "2024-09-01",
          confidence: "medium",
          rawText: "ENTRADA 01/09/2024"
        }
      ]
    });
    const stays = parsePassportVisionResponse(raw);
    expect(stays).toHaveLength(2);
    expect(stays[0]).toMatchObject({ entryDate: "2024-03-01", exitDate: "2024-06-15" });
    expect(stays[1]?.exitDate).toBeUndefined();
  });

  it("parses fenced JSON blocks", () => {
    const raw = `\`\`\`json
{"brazilStays":[{"entryDate":"2025-01-10","exitDate":"2025-04-01"}]}
\`\`\``;
    expect(parsePassportVisionResponse(raw)).toHaveLength(1);
  });

  it("filters invalid dates", () => {
    const raw = JSON.stringify({
      brazilStays: [{ entryDate: "not-a-date" }, { entryDate: "2025-01-10" }]
    });
    expect(parsePassportVisionResponse(raw)).toHaveLength(1);
  });
});
