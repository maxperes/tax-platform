import { describe, expect, it } from "vitest";
import {
  coerceFiscalFieldValue,
  isValidFiscalFieldValue,
  getActiveFiscalFieldOrder
} from "./fiscal-intake.js";

describe("map-aligned fiscal fields", () => {
  it("always asks days in Brazil and immigration facts", () => {
    const keys = getActiveFiscalFieldOrder({
      currentResidenceCountry: "US",
      nationalityCountry: "US",
      isFiscalResidentBrazil: false,
      isFiscalResidentUSA: true,
      fiscalResidenceOtherCountry: false
    }).map((f) => f.key);
    expect(keys).toContain("daysInBrazilCalendarYear");
    expect(keys).toContain("immigrationStatus");
    expect(keys).toContain("firstEntryBrazilDate");
    expect(keys).toContain("hasCpf");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("cpf");
  });

  it("accepts day bands and not sure", () => {
    expect(coerceFiscalFieldValue("daysInBrazilCalendarYear", "183+")).toBe(200);
    expect(coerceFiscalFieldValue("daysInBrazilCalendarYear", "not sure")).toBe("not_sure");
    expect(isValidFiscalFieldValue("daysInBrazilCalendarYear", "not_sure")).toBe(true);
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

  it("accepts immigration and intent tokens", () => {
    expect(coerceFiscalFieldValue("immigrationStatus", "digital nomad")).toBe("digital_nomad");
    expect(coerceFiscalFieldValue("intendsToRemain", "temporarily")).toBe("temporarily");
    expect(isValidFiscalFieldValue("hasCpf", true)).toBe(true);
  });
});
