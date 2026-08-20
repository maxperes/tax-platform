import { describe, expect, it } from "vitest";
import {
  coerceFiscalFieldValue,
  isValidFiscalFieldValue,
  getActiveFiscalFieldOrder
} from "./fiscal-intake.js";

describe("map-aligned fiscal fields", () => {
  it("asks Brazil stays and immigration facts", () => {
    const keys = getActiveFiscalFieldOrder({
      currentResidenceCountry: "US",
      nationalityCountry: "US",
      physicallyLivesInBrazil: true,
      brazilStaysText: [{ entryDate: "2024-01-01", exitDate: "2024-06-01" }],
      isFiscalResidentBrazil: false,
      isFiscalResidentUSA: true,
      fiscalResidenceOtherCountry: false
    }).map((f) => f.key);
    expect(keys).toContain("brazilStaysText");
    expect(keys).toContain("immigrationStatus");
    expect(keys).not.toContain("daysInBrazilCalendarYear");
    expect(keys).not.toContain("firstEntryBrazilDate");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("cpf");
  });

  it("parses Brazil stay text and not sure", () => {
    const stays = coerceFiscalFieldValue(
      "brazilStaysText",
      "2024-03-01, 2024-06-15\n2024-09-01, ongoing"
    );
    expect(stays).toEqual([
      { entryDate: "2024-03-01", exitDate: "2024-06-15" },
      { entryDate: "2024-09-01" }
    ]);
    expect(coerceFiscalFieldValue("brazilStaysText", "not sure")).toBe("not_sure");
    expect(isValidFiscalFieldValue("brazilStaysText", "not_sure")).toBe(true);
  });

  it("accepts slash birth dates", () => {
    expect(coerceFiscalFieldValue("birthDate", "01/01/1988")).toBe("1988-01-01");
    expect(coerceFiscalFieldValue("birthDate", "13/01/1988")).toBe("1988-01-13");
    expect(isValidFiscalFieldValue("birthDate", "01/01/1988")).toBe(true);
    expect(isValidFiscalFieldValue("birthDate", "1988-01-01")).toBe(true);
  });

  it("accepts numbered marital status choices", () => {
    expect(coerceFiscalFieldValue("maritalStatus", "1")).toBe("single");
    expect(coerceFiscalFieldValue("maritalStatus", "3")).toBe("stable_union");
    expect(coerceFiscalFieldValue("maritalStatus", "stable union")).toBe("stable_union");
    expect(coerceFiscalFieldValue("maritalStatus", "married")).toBe("married");
    expect(isValidFiscalFieldValue("maritalStatus", "stable_union")).toBe(true);
  });

  it("accepts numbered immigration status choices", () => {
    expect(coerceFiscalFieldValue("immigrationStatus", "1")).toBe("tourist");
    expect(coerceFiscalFieldValue("immigrationStatus", "3")).toBe("digital_nomad");
    expect(coerceFiscalFieldValue("immigrationStatus", "9")).toBe("none");
    expect(coerceFiscalFieldValue("immigrationStatus", "digital nomad")).toBe("digital_nomad");
    expect(coerceFiscalFieldValue("immigrationStatus", "work visa")).toBe("work_visa");
    expect(isValidFiscalFieldValue("immigrationStatus", "digital_nomad")).toBe(true);
  });

  it("asks residence permit and Brazilian return only when not already implied", () => {
    const citizenFiledInBrazil = getActiveFiscalFieldOrder({
      immigrationStatus: "citizen",
      lastFilingCountry: "BR"
    }).map((f) => f.key);
    expect(citizenFiledInBrazil).not.toContain("hasResidencePermit");
    expect(citizenFiledInBrazil).not.toContain("filedBrazilianReturn");

    const touristFiledAbroad = getActiveFiscalFieldOrder({
      immigrationStatus: "tourist",
      lastFilingCountry: "US"
    }).map((f) => f.key);
    expect(touristFiledAbroad).toContain("hasResidencePermit");
    expect(touristFiledAbroad).toContain("filedBrazilianReturn");
  });

  it("accepts immigration tokens", () => {
    expect(coerceFiscalFieldValue("immigrationStatus", "digital nomad")).toBe("digital_nomad");
    expect(isValidFiscalFieldValue("hasCpf", true)).toBe(true);
  });
});
