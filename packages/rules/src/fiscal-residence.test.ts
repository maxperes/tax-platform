import { describe, expect, it } from "vitest";
import { deriveFiscalProfile } from "./fiscal-residence.js";
import type { FiscalResidence } from "@tax-platform/shared";

const base = (): FiscalResidence => ({
  fullName: "Test User",
  email: "test@example.com",
  nationalityCountry: "BR",
  currentResidenceCountry: "US",
  birthDate: "1990-01-01",
  primaryCurrency: "USD",
  isFiscalResidentBrazil: false,
  isFiscalResidentUSA: true,
  fiscalResidenceOtherCountry: false
});

describe("deriveFiscalProfile", () => {
  it("classifies Brazil resident", () => {
    const r = deriveFiscalProfile({ ...base(), isFiscalResidentBrazil: true, isFiscalResidentUSA: false });
    expect(r.profile).toBe("resident_brazil");
  });

  it("flags dual residence", () => {
    const r = deriveFiscalProfile({ ...base(), isFiscalResidentBrazil: true, isFiscalResidentUSA: true });
    expect(r.profile).toBe("dual_residence");
    expect(r.requiresAdditionalReview).toBe(true);
  });
});
