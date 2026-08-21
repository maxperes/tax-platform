import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleDot } from "lucide-react";
import { api } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { AssessmentShell } from "../components/layout/AssessmentShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { DisclaimerBox } from "../components/ui/DisclaimerBox";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ReviewModal } from "../components/ui/ReviewModal";
import { parseInterviewRecord } from "../lib/interview/interview-to-twin";
import {
  ATTENTION_LABELS,
  asString,
  attentionIndicators,
  countriesIdentified,
  documentsByStatus,
  interviewNavStatus,
  missingInformation,
  preliminaryObservations,
  selectedAssets,
  selectedIncome
} from "../lib/interview/derive";
import { COUNTRY_OPTIONS, labelFor } from "../lib/interview/options";
import { NOT_SURE } from "../lib/interview/types";
import { formatMoney } from "../lib/chat-utils";
import { openOrCreateCopilotSession } from "../lib/copilot";
import { interviewToTwin } from "../lib/interview/interview-to-twin";
import { baselineHeadlineTax, hypothesisDateFromIso, obligationBadge } from "../lib/impact-assessment-view";
import { ScenarioCompareTable } from "../components/assessment/ScenarioCompareTable";
import { CrossBorderTable } from "../components/assessment/CrossBorderTable";
import { MonthlyCarneLeaoTable } from "../components/assessment/MonthlyCarneLeaoTable";

type TwinCase = {
  id: string;
  taxYear: number;
  interviewJson?: unknown;
  impactAssessments?: AssessmentRow[];
};

type AssessmentRow = {
  id: string;
  title: string;
  hypothesisResidencyDate: string;
  requiresAdditionalReview: boolean;
  createdAt: string;
  ruleVersion?: string;
  legalRulePackId?: string | null;
  summaryJson: {
    sections?: { title: string; bodyMarkdown?: string; payload?: Record<string, unknown> }[];
    estimatedBrGrossTaxTotal?: number;
    brazilianTaxTotal?: number;
    foreignTaxCreditTotal?: number;
    netPayableTotal?: number;
  };
  toBeJson?: {
    estimatedBrGrossTaxTotal?: number;
    brazilianTaxTotal?: number;
    foreignTaxCreditTotal?: number;
    netPayableTotal?: number;
    currency?: string;
    residency?: {
      method?: string;
      brazilianTaxResidencyStartDate?: string | null;
      lifecycleState?: string;
    };
    situationSummary?: {
      brazilianTaxResidentFrom?: string | null;
      lifecycleState?: string;
      foreignIncomeSubjectToAnalysis?: number;
      brazilianTax?: number;
      foreignTaxCredit?: number;
      netPayable?: number;
      estimatedBrGrossTaxTotal?: number;
      requiredFilings?: string[];
    };
    categoryImpacts?: {
      category: string;
      annualAmount?: number;
      currency?: string;
      estimatedBrGrossTax?: number;
      brazilianTax?: number;
      foreignTaxCredit?: number;
      netPayable?: number;
      brazilianTaxTreatment?: string;
      inBrTaxBase?: boolean;
      taxability: string;
      explanation?: {
        result: string;
        why: string;
        rule: string;
        calculation: string;
        documentNeeded: string;
        nextAction: string;
      };
    }[];
    obligations?: {
      code: string;
      label: string;
      required: boolean;
      reason?: string;
      probe?: boolean;
      explanation?: {
        result: string;
        why: string;
        rule: string;
        calculation: string;
        documentNeeded: string;
        nextAction: string;
      };
    }[];
    declarations?: { code: string; label: string; required: boolean; reason?: string }[];
    doubleTax?: {
      category: string;
      originCountry: string;
      homeContinues: boolean;
      brazilTaxes: boolean;
      ftcLikely: boolean;
      notes: string;
    }[];
    risks?: { code: string; label: string; level: string; rationale: string }[];
    reliabilityMatrix?: { conclusion: string; sourcesSummary: string; certaintyTier: string }[];
    reliefsNote?: string;
    monthlyCarneLeao?: {
      taxMonth: string;
      taxableBaseBrl?: number;
      taxComputedBrl?: number;
      creditAppliedBrl?: number;
      netDueBrl?: number;
      dueDate?: string;
      probe?: boolean;
    }[];
    crossBorderComparison?: {
      applicable?: boolean;
      usFederal?: {
        grossIncomeUsd?: number;
        netTaxDueUsd?: number;
        taxCreditAppliedUsd?: number;
        filingStatusAssumed?: string;
        note?: string;
      };
      brazil?: {
        taxBrl?: number;
        ftcBrl?: number;
        netPayableBrl?: number;
      };
      notes?: string;
    };
  };
  planningJson?: {
    estimatedSavingsTeaser?: string;
    actionPlan?: { title: string; description: string }[];
    opportunities?: { title: string; description: string; proOnly?: boolean }[];
    proUnlocked?: boolean;
    scenarios?: {
      id: string;
      label: string;
      description: string;
      estimatedBrTaxDelta: number;
      notes?: string[];
      proOnly?: boolean;
    }[];
  };
};

const ATTENTION_TONES = {
  low_attention: "positive",
  review_recommended: "warning",
  professional_analysis_required: "critical"
} as const;

function Section({
  title,
  children,
  eyebrow
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-surface-border py-8 first:border-0 first:pt-0">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-xl text-navy sm:text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ImpactReportPage() {
  const { twinId } = useParams<{ twinId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const taxYear = new Date().getFullYear();
  const [modalOpen, setModalOpen] = useState(false);

  const twinQuery = useQuery({
    queryKey: ["twin", twinId],
    queryFn: () => api<TwinCase>(`/api/twins/${twinId}`),
    enabled: Boolean(twinId)
  });

  const twin = twinQuery.data;
  const record = parseInterviewRecord(twin?.interviewJson);
  const assessmentsQuery = useQuery({
    queryKey: ["assessments", twin?.taxYear],
    queryFn: () => api<AssessmentRow[]>(`/api/impact-assessments?taxYear=${twin!.taxYear}`),
    enabled: Boolean(twin?.taxYear)
  });
  const latestId = assessmentsQuery.data?.[0]?.id ?? twin?.impactAssessments?.[0]?.id;
  const assessmentQuery = useQuery({
    queryKey: ["assessment", latestId],
    queryFn: () => api<AssessmentRow>(`/api/impact-assessments/${latestId}`),
    enabled: Boolean(latestId)
  });
  const assessment = assessmentQuery.data ?? twin?.impactAssessments?.[0];
  const navStatus = interviewNavStatus(record);
  const countries = countriesIdentified(record);
  const income = selectedIncome(record);
  const assets = selectedAssets(record);
  const observations = preliminaryObservations(record);
  const missing = missingInformation(record);
  const indicators = attentionIndicators(record);
  const available = documentsByStatus(record, "available");
  const notApplicable = documentsByStatus(record, "not_applicable");
  const immigrationStatus = asString(record, "immigration_status");
  const filingCountry = asString(record, "last_filing_country");
  const toBe = assessment?.toBeJson;
  const planning = assessment?.planningJson;

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (assessment?.id) {
        await api(`/api/impact-assessments/${assessment.id}/request-review`, { method: "POST" });
      }
      if (!twin) return;
      const mapped = interviewToTwin({ ...record, reviewRequested: true });
      await api("/api/twins", {
        method: "PUT",
        body: JSON.stringify({
          taxYear: twin.taxYear,
          inventory: mapped.inventory,
          persons: mapped.persons,
          interview: { ...record, reviewRequested: true }
        })
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["twin", twinId] });
      void qc.invalidateQueries({ queryKey: ["assessment"] });
    }
  });

  if (twinQuery.isLoading || !twin) return <LoadingShell message="Loading report…" />;

  return (
    <AssessmentShell
      twinId={twin.id}
      assessmentStatus={navStatus.assessment}
      documentsStatus={navStatus.documents}
      mapStatus={navStatus.map}
      reportStatus={navStatus.report}
      onAskCopilot={async () => nav(`/chat/${await openOrCreateCopilotSession(taxYear)}`)}
    >
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Preliminary report</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-navy">
              Brazilian tax position — preliminary map
            </h1>
            <p className="mt-2 text-sm text-navy-700/70">
              Tax year {twin.taxYear}
              {assessment?.hypothesisResidencyDate
                ? ` · Hypothesis D ${hypothesisDateFromIso(assessment.hypothesisResidencyDate) ?? assessment.hypothesisResidencyDate}`
                : ""}
              {assessment?.ruleVersion ? ` · Rules ${assessment.ruleVersion}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            {assessment?.requiresAdditionalReview && (
              <StatusBadge tone="warning">Expert review requested</StatusBadge>
            )}
            <StatusBadge tone="info">Preliminary</StatusBadge>
            <SecondaryButton onClick={() => window.print()}>Print report</SecondaryButton>
          </div>
        </header>

        {!assessment && (
          <div className="mt-6">
            <DisclaimerBox variant="info" title="Engine not run yet">
              Open the tax map and generate the report to attach calculated estimates to this map.
            </DisclaimerBox>
          </div>
        )}

        <div className="mt-8">
          <Section title="Executive overview">
            <p className="text-base leading-relaxed text-navy-700/85">
              This is a preliminary map, not a filing determination. It organises what you told us
              into the categories a Brazilian tax review would work through, and marks where a
              judgement is needed.
            </p>
            <p className="mt-4 text-base leading-relaxed text-navy-700/85">
              The most useful part is usually the list of what is missing. That is what determines
              whether a professional can reach a conclusion quickly.
            </p>
          </Section>

          <Section title="Your Brazilian tax situation" eyebrow="Summary">
            {toBe?.situationSummary ? (
              <dl className="divide-y divide-surface-border rounded-xl border border-surface-border bg-white">
                {[
                  {
                    label: "Brazilian tax resident from",
                    value: toBe.situationSummary.brazilianTaxResidentFrom ?? "Undetermined"
                  },
                  {
                    label: "Lifecycle",
                    value: (toBe.situationSummary.lifecycleState ?? "undetermined").replace(/_/g, " ")
                  },
                  {
                    label: "Foreign income subject to analysis",
                    value: formatMoney(
                      toBe.situationSummary.foreignIncomeSubjectToAnalysis ?? 0,
                      toBe.currency ?? "BRL"
                    )
                  },
                  {
                    label: "Brazilian tax",
                    value: formatMoney(toBe.situationSummary.brazilianTax ?? 0, "BRL")
                  },
                  {
                    label: "Foreign tax credit",
                    value: formatMoney(toBe.situationSummary.foreignTaxCredit ?? 0, "BRL")
                  },
                  {
                    label: "Net tax payable",
                    value: formatMoney(toBe.situationSummary.netPayable ?? 0, "BRL")
                  },
                  {
                    label: "Gross table tax (Basic)",
                    value: formatMoney(
                      toBe.situationSummary.estimatedBrGrossTaxTotal ?? toBe.estimatedBrGrossTaxTotal ?? 0,
                      "BRL"
                    )
                  },
                  {
                    label: "Required filings",
                    value:
                      (toBe.situationSummary.requiredFilings ?? []).join(", ") ||
                      "None indicated on current facts"
                  }
                ].map((row) => (
                  <div
                    key={row.label}
                    className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] sm:gap-6"
                  >
                    <dt className="text-sm text-navy-700/75">{row.label}</dt>
                    <dd className="text-sm font-medium text-navy">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              toBe?.estimatedBrGrossTaxTotal != null && (
                <p className="text-base leading-relaxed text-navy-700/85">
                  Estimated Brazilian gross tax on incomes on file:{" "}
                  <strong className="text-navy">
                    {formatMoney(toBe.estimatedBrGrossTaxTotal, toBe.currency ?? "BRL")}
                  </strong>
                  . Residency start method (hypothesis): {toBe.residency?.method ?? "undetermined"}
                  {toBe.residency?.brazilianTaxResidencyStartDate
                    ? ` → ${toBe.residency.brazilianTaxResidencyStartDate}`
                    : ""}
                  .
                  {toBe.reliefsNote ? ` ${toBe.reliefsNote}` : ""}
                </p>
              )
            )}
          </Section>

          {toBe?.crossBorderComparison &&
            (toBe.crossBorderComparison.usFederal || toBe.crossBorderComparison.brazil) && (
              <Section title="US vs Brazil (same year)" eyebrow="Orientation">
                <CrossBorderTable comparison={toBe.crossBorderComparison} />
              </Section>
            )}

          {toBe?.monthlyCarneLeao && toBe.monthlyCarneLeao.length > 0 && (
            <Section title="Monthly carnê-leão / DARF sketch" eyebrow="Cash timing">
              <MonthlyCarneLeaoTable rows={toBe.monthlyCarneLeao} />
            </Section>
          )}

          <Section title="Information considered" eyebrow="Inputs">
            <dl className="divide-y divide-surface-border rounded-xl border border-surface-border bg-white">
              {[
                { label: "Countries", value: countries.join(", ") || "None identified" },
                {
                  label: "Immigration information",
                  value:
                    immigrationStatus && immigrationStatus !== NOT_SURE
                      ? immigrationStatus.replace(/_/g, " ")
                      : "Not confirmed"
                },
                {
                  label: "Income categories",
                  value: income.map((item) => item.label).join(", ") || "None selected"
                },
                {
                  label: "Assets",
                  value: assets.map((item) => item.label).join(", ") || "None selected"
                },
                {
                  label: "Tax filings",
                  value:
                    filingCountry && filingCountry !== "none" && filingCountry !== NOT_SURE
                      ? `Last return filed in ${labelFor(COUNTRY_OPTIONS, filingCountry)}`
                      : "No prior filing reported"
                },
                {
                  label: "Documents available",
                  value: available.join(", ") || "None marked as available"
                },
                {
                  label: "Documents not applicable",
                  value: notApplicable.join(", ") || "None marked"
                }
              ].map((row) => (
                <div
                  key={row.label}
                  className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] sm:gap-6"
                >
                  <dt className="text-sm text-navy-700/75">{row.label}</dt>
                  <dd className="text-sm font-medium capitalize text-navy">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {toBe?.categoryImpacts && toBe.categoryImpacts.length > 0 && (
            <Section title="What the engine calculated" eyebrow="Explainability">
              <div className="space-y-3">
                {toBe.categoryImpacts.map((row, index) => {
                  const dt = toBe.doubleTax?.find((item) => item.category === row.category);
                  return (
                    <div key={`${row.category}-${index}`} className="rounded-xl border border-surface-border bg-white p-4">
                      <p className="text-sm font-semibold capitalize text-navy">{row.category.replace(/_/g, " ")}</p>
                      <p className="mt-2 text-sm leading-relaxed text-navy-700/80">
                        Income {formatMoney(row.annualAmount ?? 0, row.currency ?? "USD")}
                        {row.inBrTaxBase === false ? " (outside Brazilian tax base)" : ""} → taxability{" "}
                        {row.taxability.replace(/_/g, " ")}
                        {row.brazilianTaxTreatment ? ` · treatment ${row.brazilianTaxTreatment.replace(/_/g, " ")}` : ""}
                        → estimated Brazilian tax {formatMoney(row.estimatedBrGrossTax ?? 0, "BRL")}
                        {row.brazilianTax != null
                          ? ` → net payable ${formatMoney(row.netPayable ?? 0, "BRL")} (FTC ${formatMoney(row.foreignTaxCredit ?? 0, "BRL")})`
                          : ""}
                        {dt
                          ? ` → foreign tax credit ${dt.ftcLikely ? "likely" : "not assumed"} (${dt.originCountry})`
                          : ""}
                        .
                      </p>
                      {row.explanation && (
                        <ul className="mt-2 space-y-1 text-xs text-navy-700/70">
                          <li>
                            <span className="font-medium text-navy">Why.</span> {row.explanation.why}
                          </li>
                          <li>
                            <span className="font-medium text-navy">Rule.</span> {row.explanation.rule}
                          </li>
                          <li>
                            <span className="font-medium text-navy">Calculation.</span> {row.explanation.calculation}
                          </li>
                          <li>
                            <span className="font-medium text-navy">Document.</span> {row.explanation.documentNeeded}
                          </li>
                          <li>
                            <span className="font-medium text-navy">Next.</span> {row.explanation.nextAction}
                          </li>
                        </ul>
                      )}
                      {dt?.notes && <p className="mt-1 text-xs text-navy-700/65">{dt.notes}</p>}
                    </div>
                  );
                })}
              </div>
              {toBe.obligations && toBe.obligations.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {toBe.obligations.map((item) => (
                    <li
                      key={item.code}
                      className="flex justify-between gap-4 rounded-lg border border-surface-border bg-white px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="font-medium text-navy">{item.label}</span>
                        {item.reason && (
                          <span className="mt-1 block text-xs text-navy-700/70">{item.reason}</span>
                        )}
                      </span>
                      <StatusBadge tone={obligationBadge(item).tone}>
                        {obligationBadge(item).label}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
              {toBe.obligations?.some((item) => item.probe) && (
                <p className="mt-3 text-xs leading-relaxed text-navy-700/65">
                  A simplified probe is a threshold check, not an official filing determination (for
                  example CBE uses BRL proxies, not BACEN USD bands).
                </p>
              )}
            </Section>
          )}

          {toBe?.declarations && toBe.declarations.length > 0 && (
            <Section title="What you may need to declare" eyebrow="Disclosure">
              <ul className="space-y-2">
                {toBe.declarations.map((item) => (
                  <li
                    key={item.code}
                    className="flex justify-between gap-4 rounded-lg border border-surface-border bg-white px-4 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium text-navy">{item.label}</span>
                      {item.reason && (
                        <span className="mt-1 block text-xs text-navy-700/70">{item.reason}</span>
                      )}
                    </span>
                    <StatusBadge tone={item.required ? "warning" : "neutral"}>
                      {item.required ? "Declare" : "Not indicated"}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Preliminary observations" eyebrow="What stands out">
            <ul className="space-y-3">
              {observations.map((observation) => (
                <li
                  key={observation}
                  className="flex gap-3 rounded-lg border border-surface-border bg-white px-4 py-3"
                >
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span className="text-sm leading-relaxed text-navy-700">{observation}</span>
                </li>
              ))}
              {toBe?.risks?.map((risk) => (
                <li
                  key={risk.code}
                  className="flex gap-3 rounded-lg border border-surface-border bg-white px-4 py-3"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                  <span className="text-sm leading-relaxed text-navy-700">
                    <strong className="font-medium text-navy">[{risk.level}] {risk.label}.</strong>{" "}
                    {risk.rationale}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Missing information" eyebrow="Gaps">
            {missing.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden="true" />
                <p className="text-sm text-navy">Every question was answered and every document reviewed.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-navy-700/80">
                  {missing.length} item{missing.length === 1 ? "" : "s"} would need resolving before
                  any conclusion could be reached.
                </p>
                <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-surface-border bg-white p-4">
                  {missing.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-navy-700">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title="Potential planning areas" eyebrow="Where value usually sits">
            {planning?.estimatedSavingsTeaser && (
              <p className="mb-4 text-sm text-navy-700/80">{planning.estimatedSavingsTeaser}</p>
            )}
            {planning?.scenarios && planning.scenarios.length > 0 && (
              <div className="mb-6 rounded-xl border border-surface-border bg-white p-4">
                <h3 className="text-sm font-semibold text-navy">Move-date and sale scenarios</h3>
                <p className="mt-1 mb-3 text-xs text-navy-700/70">
                  Each scenario re-runs the To Be engine against this inventory.
                </p>
                <ScenarioCompareTable
                  scenarios={planning.scenarios}
                  baselineTax={baselineHeadlineTax(toBe)}
                  currency={toBe?.currency ?? "BRL"}
                  proUnlocked={planning.proUnlocked}
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(planning?.opportunities?.length
                ? planning.opportunities.map((item) => ({ title: item.title, body: item.description }))
                : [
                    { title: "Pre-migration planning", body: "Decisions taken before a move often have more effect than anything done afterwards." },
                    { title: "Foreign tax credit review", body: "Whether tax already paid abroad can be set against a Brazilian liability, and on what evidence." },
                    { title: "Investment classification", body: "How each account and instrument is characterised under Brazilian rules." },
                    { title: "Retirement distribution timing", body: "When benefits are drawn can matter as much as how much is drawn." },
                    { title: "Corporate structure review", body: "Whether existing holding structures still make sense from both sides." },
                    { title: "Capital gain timing", body: "The year a disposal falls into can change the analysis considerably." }
                  ]
              ).map((area) => (
                <article key={area.title} className="rounded-lg border border-surface-border bg-white p-4">
                  <h3 className="text-sm font-semibold text-navy">{area.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-navy-700/75">{area.body}</p>
                </article>
              ))}
            </div>
            {planning?.actionPlan && planning.actionPlan.length > 0 && (
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-navy-700">
                {planning.actionPlan.map((item) => (
                  <li key={item.title}>
                    <span className="font-medium text-navy">{item.title}.</span> {item.description}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Attention indicators" eyebrow="Where to look first">
            <div className="space-y-3">
              {indicators.map((indicator) => (
                <div
                  key={indicator.label}
                  className="flex flex-col gap-2 rounded-lg border border-surface-border bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div>
                    <p className="text-sm font-medium text-navy">{indicator.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-navy-700/70">{indicator.note}</p>
                  </div>
                  <StatusBadge tone={ATTENTION_TONES[indicator.level]}>
                    {ATTENTION_LABELS[indicator.level]}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </Section>

          {toBe?.reliabilityMatrix && toBe.reliabilityMatrix.length > 0 && (
            <Section title="Reliability and sources" eyebrow="Audit trail">
              <ul className="space-y-2">
                {toBe.reliabilityMatrix.map((item, index) => (
                  <li key={`${item.conclusion}-${index}`} className="rounded-lg border border-surface-border bg-white px-4 py-3">
                    <p className="text-sm font-medium text-navy">{item.conclusion}</p>
                    <p className="mt-1 text-xs text-navy-700/70">
                      {item.sourcesSummary} · {item.certaintyTier}
                    </p>
                  </li>
                ))}
              </ul>
              {assessment?.legalRulePackId && (
                <p className="mt-3 text-xs text-navy-700/60">Legal pack {assessment.legalRulePackId}</p>
              )}
            </Section>
          )}

          <Section title="Disclaimer">
            <DisclaimerBox variant="critical">
              This report does not constitute legal, tax or accounting advice. No filing or
              financial decision should be based on it without professional review. Figures are
              preliminary orientation only.
            </DisclaimerBox>
          </Section>
        </div>

        <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card print:hidden">
          <h2 className="font-display text-xl text-navy">Hand this over to a professional</h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-700/80">
            A reviewer receives your answers, your document checklist and the points flagged above,
            and starts from an organised file.
          </p>
          {record.reviewRequested && (
            <p className="mt-4 text-sm font-medium text-navy">Review already requested on this file.</p>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton onClick={() => setModalOpen(true)}>Request professional review</PrimaryButton>
            <SecondaryButton href={`/impact/${twinId}/map`}>Back to map</SecondaryButton>
          </div>
        </div>

        <ReviewModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmitted={async () => {
            await reviewMutation.mutateAsync();
          }}
        />
      </div>
    </AssessmentShell>
  );
}
