import { describe, expect, it } from "vitest";
import type { FiscalResidence } from "./fiscal-residence.js";
import {
  mergeInterviewRecords,
  parseInterviewRecord,
  emptyInterviewRecord
} from "./interview-record.js";
import {
  mapIncomeTypeToInterview,
  sessionFactsToInterviewRecord
} from "./session-to-interview.js";
import { interviewToTwin } from "./interview-to-twin.js";

const baseFiscal: FiscalResidence = {
  fullName: "Alex Example",
  email: "alex@example.com",
  nationalityCountry: "US",
  currentResidenceCountry: "BR",
  birthDate: "1980-05-01",
  primaryCurrency: "USD",
  isFiscalResidentBrazil: true,
  isFiscalResidentUSA: true,
  fiscalResidenceOtherCountry: false,
  physicallyLivesInBrazil: true,
  brazilStays: [
    { entryDate: "2024-02-19" },
    { entryDate: "2025-01-01", exitDate: "2025-06-30" }
  ],
  declaredPermanentExitBrazil: false,
  cpf: "123",
  hasDependentsBrazilOrAbroad: false
};

describe("sessionFactsToInterviewRecord", () => {
  it("maps fiscal residence into interview answers", () => {
    const record = sessionFactsToInterviewRecord({ fiscal: baseFiscal });
    expect(record.answers.full_name).toBe("Alex Example");
    expect(record.answers.citizenship).toBe("us");
    expect(record.answers.residence_country).toBe("br");
    expect(record.answers.currently_in_brazil).toBe("yes");
    expect(record.answers.brazil_trip_1_entry).toBe("2024-02-19");
    expect(record.answers.brazil_trip_count).toBe("2");
    expect(record.answers.dual_residency_risk).toBe("yes");
    expect(record.answers.has_cpf).toBe("yes");
    expect(record.meta?.source).toBe("copilot");
    expect(record.assessmentComplete).toBe(true);
  });

  it("maps map-aligned fiscal fields into interview keys", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: {
        ...baseFiscal,
        brazilStays: [{ entryDate: "2026-03-15", exitDate: "2026-06-01" }],
        immigrationStatus: "digital_nomad",
        hasCpf: true,
        hasResidencePermit: false,
        lastFilingCountry: "US",
        filedBrazilianReturn: false,
        maritalStatus: "married",
        dependentsCount: 2
      }
    });
    expect(record.answers.brazil_trip_1_entry).toBe("2026-03-15");
    expect(record.answers.brazil_trip_1_exit).toBe("2026-06-01");
    expect(record.answers.immigration_status).toBe("digital_nomad");
    expect(record.answers.has_residence_permit).toBe("no");
    expect(record.answers.last_filing_country).toBe("us");
    expect(record.answers.filed_brazilian_return).toBe("no");
    expect(record.answers.marital_status).toBe("married");
    expect(record.answers.dependents).toBe("2");
  });

  it("maps incomes into categories and follow-up keys", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: baseFiscal,
      incomes: [
        {
          incomeType: "salary",
          nature: "work",
          originCountry: "US",
          grossAmount: 10000,
          originalCurrency: "USD",
          periodicity: "monthly",
          withholdingTax: 500
        },
        {
          incomeType: "Social Security",
          nature: "retirement",
          originCountry: "US",
          grossAmount: 24000,
          originalCurrency: "USD",
          periodicity: "annual",
          taxPaidOriginCountry: 0
        }
      ]
    });
    expect(record.answers.income_types).toEqual(expect.arrayContaining(["salary", "social_security"]));
    expect(record.answers.income_salary_amount).toBe("120000");
    expect(record.answers.income_salary_country).toBe("us");
    expect(record.answers.income_salary_currency).toBe("USD");
    expect(record.answers.income_salary_withholding).toBe("500");
    expect(record.answers.paid_foreign_tax).toBe("yes");
  });

  it("projects payment date and copilot treatment onto interview keys", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: baseFiscal,
      incomes: [
        {
          incomeType: "salary",
          nature: "work",
          originCountry: "US",
          grossAmount: 40000,
          originalCurrency: "USD",
          periodicity: "annual",
          paymentDate: "2026-08-12",
          brazilianTaxTreatment: "salary_progressive"
        }
      ]
    });
    expect(record.answers.income_salary_payment_date).toBe("2026-08-12");
    expect(record.answers.income_salary_treatment).toBe("salary_progressive");
    const { inventory } = interviewToTwin(record);
    expect(inventory.incomes[0]?.paymentDate).toBe("2026-08-12");
    expect(inventory.incomes[0]?.brazilianTaxTreatment).toBe("salary_progressive");
  });

  it("maps assets and trusts", () => {
    const record = sessionFactsToInterviewRecord({
      assets: [{ assetType: "brokerage account" }, { assetType: "real estate" }],
      trusts: [{ name: "Family trust", jurisdiction: "US" }]
    });
    expect(record.answers.asset_types).toEqual(
      expect.arrayContaining(["brokerage", "real_estate", "trust_interests"])
    );
    expect(record.answers.owns_entities).toBe("yes");
  });

  it("returns empty when no facts", () => {
    expect(sessionFactsToInterviewRecord({})).toEqual(emptyInterviewRecord());
  });
});

describe("mapIncomeTypeToInterview", () => {
  it("normalises free-text and nature fallbacks", () => {
    expect(mapIncomeTypeToInterview("RSU vesting")).toBe("rsus");
    expect(mapIncomeTypeToInterview("misc", "work")).toBe("salary");
  });
});

describe("mergeInterviewRecords", () => {
  it("preserves interview-only answers and updates projected keys", () => {
    const existing = parseInterviewRecord({
      answers: {
        full_name: "From interview",
        immigration_status: "digital_nomad",
        citizenship: "us"
      },
      meta: { source: "interview", projectedKeys: ["citizenship"] }
    });
    const projected = sessionFactsToInterviewRecord({
      fiscal: { ...baseFiscal, fullName: "From copilot", nationalityCountry: "PT" }
    });
    const merged = mergeInterviewRecords(existing, projected);
    expect(merged.answers.immigration_status).toBe("digital_nomad");
    expect(merged.answers.citizenship).toBe("pt");
    expect(merged.answers.full_name).toBe("From interview");
    expect(merged.meta?.source).toBe("merged");
  });
});

describe("interviewToTwin", () => {
  it("builds inventory from projected interview answers", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: baseFiscal,
      incomes: [
        {
          incomeType: "salary",
          nature: "work",
          originCountry: "US",
          grossAmount: 5000,
          originalCurrency: "USD",
          periodicity: "monthly"
        }
      ]
    });
    const { inventory, persons } = interviewToTwin(record);
    expect(persons[0]?.fullName).toBe("Alex Example");
    expect(inventory.incomes[0]?.category).toBe("salary");
    expect(inventory.incomes[0]?.annualAmount).toBe(60000);
    expect(inventory.incomes[0]?.brazilianTaxTreatment).toBe("salary_progressive");
    expect(inventory.residency.daysInBrazilCalendarYear).toBeGreaterThan(0);
    expect(inventory.residency.physicallyLivesInBrazil).toBe(true);
  });

  it("drops invalid stay entry dates", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: { ...baseFiscal, brazilStays: undefined }
    });
    record.answers.brazil_trip_count = "1";
    record.answers.brazil_trip_1_entry = "not sure";
    const { inventory } = interviewToTwin(record);
    expect(inventory.residency.firstEntryBrazilDate).toBeUndefined();
  });

  it("maps stay dates and asset countries into twin inventory", () => {
    const record = sessionFactsToInterviewRecord({
      fiscal: { ...baseFiscal, brazilStays: undefined }
    });
    record.answers.brazil_trip_count = "2";
    record.answers.brazil_trip_1_entry = "2025-09-01";
    record.answers.brazil_trip_1_exit = "2025-12-09";
    record.answers.brazil_trip_2_entry = "2026-01-01";
    record.answers.brazil_trip_2_exit = undefined;
    record.answers.currently_in_brazil = "yes";
    record.answers.asset_types = ["brokerage", "brazilian_companies"];
    record.answers.asset_brokerage_country = "pt";
    record.answers.asset_brazilian_companies_country = "br";
    const { inventory } = interviewToTwin(record);
    expect(inventory.residency.brazilStays).toEqual([
      { entryDate: "2025-09-01", exitDate: "2025-12-09" },
      { entryDate: "2026-01-01" }
    ]);
    expect(inventory.residency.firstEntryBrazilDate).toBe("2025-09-01");
    expect(inventory.assets).toEqual([
      { name: "Brokerage accounts", assetType: "brokerage", country: "PT", currency: "EUR" },
      { name: "Brazilian companies", assetType: "brazilian_companies", country: "BR", currency: "BRL" }
    ]);
  });
});
