import type { DemoRecord } from "./types";
import { emptyRecord } from "./storage";

/**
 * A fully invented profile used to populate the dashboard and report when the
 * visitor has not answered anything yet, and behind the "View demo report" link.
 * Nothing here describes a real person.
 */
export const SAMPLE_RECORD: DemoRecord = {
  ...emptyRecord(),
  answers: {
    citizenship: "us",
    residence_country: "br",
    date_of_birth: "1958-04-12",
    marital_status: "married",
    dependents: "1",
    currently_in_brazil: "yes",
    brazil_trip_count: "1",
    brazil_trip_1_entry: "2024-02-19",
    immigration_status: "retirement_visa",
    has_cpf: "yes",
    has_residence_permit: "yes",
    last_filing_country: "us",
    filed_brazilian_return: "no",
    filed_departure_declaration: "not_applicable",
    self_assessed_residency: "yes",
    dual_residency_risk: "not_sure",
    income_types: [
      "social_security",
      "private_pension",
      "dividends",
      "interest",
      "rental",
    ],
    asset_types: [
      "bank_accounts",
      "brokerage",
      "retirement_accounts",
      "real_estate",
    ],
    paid_foreign_tax: "yes",
    foreign_tax_withheld: "yes",
    has_foreign_returns: "yes",
    has_statements: "yes",
    has_retirement_statements: "yes",
    owns_entities: "no",
    missing_documents: "some",
  },
  documents: {
    passport_immigration: "available",
    prior_brazilian_return: "not_applicable",
    foreign_tax_return: "available",
    salary_statement: "not_applicable",
    retirement_statement: "available",
    bank_statement: "available",
    brokerage_statement: "missing",
    corporate_documents: "not_applicable",
    property_documents: "needs_review",
    foreign_tax_evidence: "missing",
    trust_documents: "not_applicable",
    other_documents: "not_applicable",
  },
  assessmentComplete: true,
  documentsComplete: true,
  reviewRequested: false,
  updatedAt: null,
};

/** True when the visitor has not entered anything worth reading yet. */
export function isEmptyRecord(record: DemoRecord): boolean {
  return (
    Object.keys(record.answers).length === 0 &&
    Object.keys(record.documents).length === 0
  );
}

/** Returns the visitor's own record, or the invented one when there is nothing to show. */
export function recordForDisplay(record: DemoRecord): {
  data: DemoRecord;
  isSample: boolean;
} {
  if (isEmptyRecord(record)) return { data: SAMPLE_RECORD, isSample: true };
  return { data: record, isSample: false };
}
