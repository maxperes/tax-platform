import { describe, expect, it } from "vitest";
import { DOCUMENT_DEFS } from "./options";
import { STEPS, stepsForInterview } from "./questions";
import { NOT_SURE, emptyInterviewRecord, type InterviewRecord } from "./types";
import {
  analysisAreas,
  assessmentPercent,
  attentionIndicators,
  countriesIdentified,
  countryBlocks,
  documentsNeedingAttention,
  documentsPercent,
  interviewNavStatus,
  interviewSteps,
  missingInformation,
  overallPercent,
  preliminaryFindings,
  preliminaryObservations,
  residencySignals,
  residencyTimeline,
  selectedAssets,
  selectedIncome,
  stepStatus
} from "./derive";

function record(
  answers: InterviewRecord["answers"],
  extra: Partial<InterviewRecord> = {}
): InterviewRecord {
  return {
    ...emptyInterviewRecord(),
    ...extra,
    answers
  };
}

describe("interview derivation", () => {
  it("treats an empty record as not started", () => {
    const empty = emptyInterviewRecord();
    expect(assessmentPercent(empty)).toBe(0);
    expect(documentsPercent(empty)).toBe(0);
    expect(overallPercent(empty)).toBe(0);
    expect(stepStatus(empty, 0)).toBe("not_started");
    expect(interviewNavStatus(empty)).toEqual({
      assessment: "not_started",
      documents: "not_started",
      map: "not_started",
      report: "not_started"
    });
    expect(countriesIdentified(empty)).toEqual(["Brazil"]);
    expect(selectedIncome(empty)).toEqual([]);
    expect(selectedAssets(empty)).toEqual([]);
  });

  it("marks a step in progress until every question is answered", () => {
    const partial = record({ citizenship: "us", residence_country: "us" });
    expect(stepStatus(partial, 0)).toBe("in_progress");
    expect(assessmentPercent(partial)).toBeGreaterThan(0);
    expect(assessmentPercent(partial)).toBeLessThan(100);

    const completePersonal = record({
      citizenship: "us",
      residence_country: "us",
      full_name: "Alex",
      date_of_birth: "1980-01-01",
      marital_status: "single",
      dependents: "0"
    });
    expect(stepStatus(completePersonal, 0)).toBe("complete");
  });

  it("inserts an income-details step when income types are selected", () => {
    const withSalary = record({ income_types: ["salary"] });
    const steps = interviewSteps(withSalary);
    expect(steps.map((step) => step.id)).toContain("income_details");
    expect(steps).toEqual(stepsForInterview(["salary"]));
    expect(interviewSteps(emptyInterviewRecord())).toEqual(STEPS);
  });

  it("inserts asset-location steps from follow-up answers", () => {
    const filled = record({
      currently_in_brazil: "yes",
      brazil_trip_count: "1",
      brazil_trip_1_entry: "2026-01-01",
      asset_types: ["brokerage", "real_estate"]
    });
    const ids = interviewSteps(filled).map((step) => step.id);
    expect(ids).not.toContain("brazil_presence");
    expect(ids).toContain("asset_details");
    expect(ids.indexOf("asset_details")).toBeGreaterThan(ids.indexOf("assets"));
  });

  it("weights overall progress 70/30 between questionnaire and documents", () => {
    const answers: InterviewRecord["answers"] = {
      income_types: ["salary"],
      asset_types: ["real_estate"]
    };
    for (const step of interviewSteps(record(answers))) {
      for (const question of step.questions) {
        if (answers[question.id] !== undefined) continue;
        answers[question.id] = question.type === "multiselect" ? ["real_estate"] : "yes";
      }
    }
    const questionnaireOnly = record(answers);
    expect(assessmentPercent(questionnaireOnly)).toBe(100);
    expect(overallPercent(questionnaireOnly)).toBe(70);

    const documents: InterviewRecord["documents"] = {};
    for (const doc of DOCUMENT_DEFS) {
      documents[doc.id] = "available";
    }
    const both = { ...questionnaireOnly, documents };
    expect(documentsPercent(both)).toBe(100);
    expect(overallPercent(both)).toBe(100);
  });

  it("identifies countries and country blocks from answers", () => {
    const usBr = record({
      citizenship: "us",
      residence_country: "us",
      last_filing_country: "us",
      income_types: ["salary"],
      income_salary_country: "us",
      asset_types: ["brokerage", "brazilian_companies"],
      asset_brokerage_country: "us",
      asset_brazilian_companies_country: "br",
      paid_foreign_tax: "yes",
      filed_brazilian_return: "yes"
    });
    expect(countriesIdentified(usBr)).toEqual(["Brazil", "United States"]);

    const blocks = countryBlocks(usBr);
    const us = blocks.find((block) => block.key === "us");
    const br = blocks.find((block) => block.key === "br");
    const other = blocks.find((block) => block.key === "other");
    expect(us?.active).toBe(true);
    expect(us?.incomeCount).toBe(1);
    expect(us?.assetCount).toBe(1);
    expect(us?.taxesPaid).toBe("Reported");
    expect(br?.active).toBe(true);
    expect(br?.assetCount).toBe(1);
    expect(br?.taxesPaid).toBe("Return filed previously");
    expect(other?.active).toBe(false);
  });

  it("builds residency signals and a timeline from presence answers", () => {
    const filled = record({
      has_residence_permit: "yes",
      dual_residency_risk: "yes",
      brazil_trip_count: "1",
      brazil_trip_1_entry: "2026-03-01",
      brazil_trip_1_exit: "2026-08-01",
      last_filing_country: "us",
      currently_in_brazil: "no"
    });
    const signals = residencySignals(filled);
    expect(signals[0]?.label).toBe("Days of presence");
    expect(signals[0]?.value).toMatch(/days recorded/);
    expect(signals[1]?.value).toBe("Held");
    expect(signals[2]?.value).toBe("Flagged");

    const timeline = residencyTimeline(filled);
    expect(timeline.map((event) => event.title)).toEqual([
      "Tax return filed in United States",
      "Entry into Brazil (stay 1)",
      "Exit from Brazil (stay 1)",
      "Presence in Brazil recorded",
      "Residency position reviewed by a professional"
    ]);
  });

  it("puts stay entry and exit dates on the residency timeline", () => {
    const filled = record({
      brazil_trip_count: "2",
      brazil_trip_1_entry: "2025-09-01",
      brazil_trip_1_exit: "2025-12-09",
      brazil_trip_2_entry: "2026-01-01",
      currently_in_brazil: "yes"
    });
    expect(residencyTimeline(filled).map((event) => event.title)).toEqual([
      "Entry into Brazil (stay 1)",
      "Exit from Brazil (stay 1)",
      "Entry into Brazil (stay 2)",
      "Presence in Brazil recorded",
      "Currently present in Brazil",
      "Residency position reviewed by a professional"
    ]);
  });

  it("flags findings, analysis areas, and observations from high-risk answers", () => {
    const filled = record(
      {
        citizenship: "us",
        residence_country: "us",
        currently_in_brazil: "yes",
        income_types: ["salary", "social_security", "rental"],
        asset_types: ["real_estate", "foreign_companies"],
        paid_foreign_tax: "yes",
        owns_entities: "yes",
        dual_residency_risk: "yes"
      },
      {
        documents: {
          foreign_tax_evidence: "missing",
          passport_immigration: "needs_review"
        }
      }
    );

    const findings = preliminaryFindings(filled);
    expect(findings.some((row) => row.label === "Foreign companies or trusts" && row.status === "potential_tax_issue")).toBe(
      true
    );
    expect(findings.some((row) => row.label === "Overlapping residency claims" && row.status === "potential_tax_issue")).toBe(
      true
    );
    expect(findings.some((row) => row.label === "Foreign tax already paid" && row.status === "additional_document_needed")).toBe(
      true
    );

    const areas = analysisAreas(filled);
    expect(areas.find((area) => area.label === "Foreign tax credit")?.relevant).toBe(true);
    expect(areas.find((area) => area.label === "Retirement income")?.relevant).toBe(true);
    expect(areas.find((area) => area.label === "Corporate interests")?.relevant).toBe(true);
    expect(areas.find((area) => area.label === "Real estate income")?.relevant).toBe(true);
    expect(areas.find((area) => area.label === "Tax residency")?.relevant).toBe(true);

    const observations = preliminaryObservations(filled);
    expect(observations.some((line) => /Foreign income may need classification/.test(line))).toBe(true);
    expect(observations.some((line) => /credit eligibility/.test(line))).toBe(true);
    expect(observations.some((line) => /Retirement income/.test(line))).toBe(true);
    expect(observations.some((line) => /Foreign company or trust/.test(line))).toBe(true);
    expect(observations.some((line) => /Property held abroad/.test(line))).toBe(true);
    expect(observations.some((line) => /treaty analysis/.test(line))).toBe(true);

    expect(documentsNeedingAttention(filled)).toEqual([
      "Passport or immigration record",
      "Foreign tax payment evidence"
    ]);
  });

  it("lists unanswered and not-sure fields, then sets nav status from completion flags", () => {
    const unsure = record({ citizenship: NOT_SURE, residence_country: "us" });
    const missing = missingInformation(unsure);
    expect(missing.some((line) => line.includes('answered "I\'m not sure"'))).toBe(true);
    expect(missing.some((line) => line.includes("not answered"))).toBe(true);
    expect(missing.some((line) => line.includes("not reviewed"))).toBe(true);

    const complete = record(
      { citizenship: "us" },
      { assessmentComplete: true, documentsComplete: true, reviewRequested: true }
    );
    expect(interviewNavStatus(complete)).toEqual({
      assessment: "complete",
      documents: "complete",
      map: "complete",
      report: "complete"
    });
  });

  it("raises documentation attention as missing items accumulate", () => {
    const none = emptyInterviewRecord();
    expect(attentionIndicators(none)[1]?.level).toBe("low_attention");

    const few = record(
      {},
      { documents: { passport_immigration: "missing", foreign_tax_return: "needs_review" } }
    );
    expect(attentionIndicators(few)[1]?.level).toBe("review_recommended");

    const many = record(
      { owns_entities: "yes", income_types: ["salary", "dividends", "interest", "rental", "crypto"] },
      {
        documents: {
          passport_immigration: "missing",
          prior_brazilian_return: "missing",
          foreign_tax_return: "missing",
          salary_statement: "needs_review"
        }
      }
    );
    const indicators = attentionIndicators(many);
    expect(indicators[1]?.level).toBe("professional_analysis_required");
    expect(indicators[2]?.level).toBe("professional_analysis_required");
    expect(indicators.some((row) => row.label === "Entity ownership")).toBe(true);
  });
});
