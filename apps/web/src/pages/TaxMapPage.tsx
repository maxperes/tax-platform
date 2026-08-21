import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileWarning, Gauge, Globe2, Landmark, Wallet } from "lucide-react";
import { api } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { AssessmentShell } from "../components/layout/AssessmentShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { SummaryCard } from "../components/ui/SummaryCard";
import { DashboardPanel } from "../components/ui/DashboardPanel";
import { DisclaimerBox } from "../components/ui/DisclaimerBox";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ResidencyTimeline } from "../components/dashboard/ResidencyTimeline";
import { CountryCard } from "../components/dashboard/CountryCard";
import { FindingRow } from "../components/dashboard/FindingRow";
import { AnalysisAreaCard } from "../components/dashboard/AnalysisAreaCard";
import { ScenarioCompareTable } from "../components/assessment/ScenarioCompareTable";
import { parseInterviewRecord } from "../lib/interview/interview-to-twin";
import { asString } from "../lib/interview/derive";
import {
  analysisAreas,
  countriesIdentified,
  countryBlocks,
  documentsNeedingAttention,
  interviewNavStatus,
  overallPercent,
  preliminaryFindings,
  residencySignals,
  residencyTimeline,
  selectedAssets,
  selectedIncome,
  type Finding
} from "../lib/interview/derive";
import { formatMoney } from "../lib/chat-utils";
import { openOrCreateCopilotSession } from "../lib/copilot";
import {
  baselineHeadlineTax,
  hypothesisDateFromIso
} from "../lib/impact-assessment-view";

type TwinCase = {
  id: string;
  taxYear: number;
  interviewJson?: unknown;
  impactAssessments?: { id: string }[];
};

type AssessmentRow = {
  id: string;
  hypothesisResidencyDate?: string;
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
      foreignIncomeSubjectToAnalysis?: number;
      brazilianTax?: number;
      foreignTaxCredit?: number;
      netPayable?: number;
      requiredFilings?: string[];
    };
    obligations?: { code: string; label: string; required: boolean; reason?: string; probe?: boolean }[];
    risks?: { code: string; label: string; level: string; rationale: string }[];
  };
  planningJson?: {
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

export function TaxMapPage() {
  const { twinId } = useParams<{ twinId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const taxYear = new Date().getFullYear();
  const [dateOverride, setDateOverride] = useState<string | null>(null);

  const twinQuery = useQuery({
    queryKey: ["twin", twinId],
    queryFn: () => api<TwinCase>(`/api/twins/${twinId}`),
    enabled: Boolean(twinId)
  });

  const twin = twinQuery.data;
  const record = parseInterviewRecord(twin?.interviewJson);
  const hasAnswers = Object.keys(record.answers).length > 0;
  const navStatus = interviewNavStatus(record);
  const countries = countriesIdentified(record);
  const income = selectedIncome(record);
  const assets = selectedAssets(record);
  const attention = documentsNeedingAttention(record);
  const interviewFindings = preliminaryFindings(record);
  const areas = analysisAreas(record);
  const blocks = countryBlocks(record);
  const signals = residencySignals(record);
  const timeline = residencyTimeline(record);
  const entry = asString(record, "first_entry_date");

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
  const assessment = assessmentQuery.data;
  const toBe = assessment?.toBeJson;
  const planning = assessment?.planningJson;
  const defaultHypothesis = useMemo(() => {
    const fromAssessment = hypothesisDateFromIso(assessment?.hypothesisResidencyDate);
    if (fromAssessment) return fromAssessment;
    if (entry && entry !== "not_sure") return entry;
    return `${taxYear}-07-01`;
  }, [assessment?.hypothesisResidencyDate, entry, taxYear]);
  const hypothesisDate = dateOverride ?? defaultHypothesis;
  const engineFindings: Finding[] =
    toBe?.obligations
      ?.filter((item) => item.required && item.code !== "NO_FILING")
      .map((item) => ({
        label: item.label,
        status: "professional_review_recommended" as const,
        note: item.probe
          ? `${item.reason ?? "Indicated by the rules engine."} Simplified threshold probe — not an official filing determination.`
          : (item.reason ?? "Indicated by the rules engine.")
      })) ?? [];
  const riskFindings: Finding[] =
    toBe?.risks?.map((risk) => ({
      label: risk.label,
      status: risk.level === "high" ? "potential_tax_issue" : "professional_review_recommended",
      note: risk.rationale
    })) ?? [];
  const findings =
    engineFindings.length > 0 || riskFindings.length > 0
      ? [...engineFindings, ...riskFindings]
      : interviewFindings;

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!twin) throw new Error("Missing case");
      return api<{ assessment: { id: string } }>("/api/impact-assessments/run", {
        method: "POST",
        body: JSON.stringify({
          twinCaseId: twin.id,
          hypothesisResidencyDate: hypothesisDate,
          applyReliefs: false
        })
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["twin", twinId] });
      void qc.invalidateQueries({ queryKey: ["assessments"] });
      nav(`/impact/${twinId}/report`);
    }
  });

  if (twinQuery.isError) {
    return (
      <AssessmentShell twinId={twinId}>
        <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
          <p className="text-sm text-alertRed">
            {twinQuery.error instanceof Error ? twinQuery.error.message : "Could not load your tax map."}
          </p>
          <SecondaryButton className="mt-4" onClick={() => void twinQuery.refetch()}>
            Try again
          </SecondaryButton>
        </div>
      </AssessmentShell>
    );
  }

  if (twinQuery.isLoading || !twin) return <LoadingShell message="Loading tax map…" />;

  return (
    <AssessmentShell
      twinId={twin.id}
      assessmentStatus={navStatus.assessment}
      documentsStatus={navStatus.documents}
      mapStatus={navStatus.map}
      reportStatus={navStatus.report}
      onAskCopilot={async () => nav(`/chat/${await openOrCreateCopilotSession(taxYear)}`)}
    >
      <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Preliminary tax map</p>
            <h1 className="mt-2 font-display text-2xl leading-tight text-navy sm:text-3xl">
              Your 360° view
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-700/80">
              Everything below is assembled from your interview or copilot intake. Residency is not
              concluded here. Amounts appear after the rules engine runs the report.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm text-navy">
              <span className="text-xs font-medium text-navy-700/75">Hypothesis residency date (D)</span>
              <input
                type="date"
                className="field-input min-w-[11rem]"
                value={hypothesisDate}
                onChange={(event) => setDateOverride(event.target.value)}
                disabled={!hasAnswers}
              />
            </label>
            <PrimaryButton
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || !hasAnswers}
            >
              {runMutation.isPending
                ? "Running…"
                : assessment
                  ? "Re-run and view report"
                  : "View preliminary report"}
            </PrimaryButton>
            {assessment && (
              <SecondaryButton href={`/impact/${twinId}/report`}>Open last report</SecondaryButton>
            )}
            <SecondaryButton href={`/impact/${twinId}`}>Edit interview</SecondaryButton>
            <SecondaryButton href={`/impact/${twinId}/documents`}>Review documents</SecondaryButton>
          </div>
        </header>

        {hasAnswers && (
          <p className="mt-3 text-xs text-navy-700/65">
            The engine simulates Brazilian tax residency from date D. Changing D and re-running
            replaces the last preliminary map for this year.
          </p>
        )}

        {!hasAnswers && (
          <div className="mt-6 space-y-3">
            <DisclaimerBox variant="info" title="Start building your map">
              This map is empty until you answer the questionnaire or sync facts from a copilot
              session. There is no sample profile in the product.
            </DisclaimerBox>
            <div className="flex flex-wrap gap-3">
              <SecondaryButton href={`/impact/${twinId}`}>Start interview</SecondaryButton>
              <SecondaryButton
                onClick={async () => nav(`/chat/${await openOrCreateCopilotSession(taxYear)}`)}
              >
                Build with copilot
              </SecondaryButton>
            </div>
          </div>
        )}

        {hasAnswers && (record.meta?.source === "copilot" || record.meta?.source === "merged") && (
          <div className="mt-6">
            <DisclaimerBox variant="info" title="Built from filing intake">
              Gaps that the copilot did not collect are left blank or marked as not sure. You can
              refine answers in the interview anytime.
            </DisclaimerBox>
          </div>
        )}

        {runMutation.isError && (
          <p className="mt-4 text-sm text-alertRed">
            {runMutation.error instanceof Error ? runMutation.error.message : "Could not run assessment"}
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            label="Assessment completion"
            value={`${overallPercent(record)}%`}
            hint="Questionnaire and document checklist combined."
            icon={<Gauge className="h-4 w-4" />}
          />
          <SummaryCard
            label="Possible Brazil tax residency"
            value={
              toBe?.residency?.brazilianTaxResidencyStartDate
                ? toBe.residency.brazilianTaxResidencyStartDate
                : "Requires analysis"
            }
            hint={
              toBe?.residency?.lifecycleState
                ? `Lifecycle: ${toBe.residency.lifecycleState.replace(/_/g, " ")} — not a filing determination.`
                : "Never concluded from a questionnaire alone."
            }
            icon={<Landmark className="h-4 w-4" />}
          />
          <SummaryCard
            label="Countries identified"
            value={countries.length}
            hint={countries.join(", ") || "None yet"}
            icon={<Globe2 className="h-4 w-4" />}
          />
          <SummaryCard
            label="Income categories"
            value={income.length}
            hint={income.length > 0 ? income.map((item) => item.label).join(", ") : "None selected yet."}
            icon={<Wallet className="h-4 w-4" />}
          />
          <SummaryCard
            label="Asset categories"
            value={assets.length}
            hint={assets.length > 0 ? assets.map((item) => item.label).join(", ") : "None selected yet."}
            icon={<Building2 className="h-4 w-4" />}
          />
          <SummaryCard
            label="Documents requiring attention"
            value={attention.length}
            hint={attention.length > 0 ? attention.join(", ") : "Nothing flagged in the checklist."}
            icon={<FileWarning className="h-4 w-4" />}
          />
          {toBe?.situationSummary && (
            <>
              <SummaryCard
                label="Estimated Brazilian tax"
                value={formatMoney(toBe.situationSummary.brazilianTax ?? 0, "BRL")}
                hint={`FTC ${formatMoney(toBe.situationSummary.foreignTaxCredit ?? 0, "BRL")} · net ${formatMoney(toBe.situationSummary.netPayable ?? 0, "BRL")}`}
                icon={<Wallet className="h-4 w-4" />}
              />
              <SummaryCard
                label="Foreign income in scope"
                value={formatMoney(toBe.situationSummary.foreignIncomeSubjectToAnalysis ?? 0, "BRL")}
                hint={
                  (toBe.situationSummary.requiredFilings ?? []).join(", ") ||
                  "No required filings indicated"
                }
                icon={<Globe2 className="h-4 w-4" />}
              />
            </>
          )}
        </div>

        {planning?.scenarios && planning.scenarios.length > 0 && (
          <div className="mt-8">
            <DashboardPanel
              title="Move-date scenarios"
              description="Each row re-runs the To Be engine. Origin-country tax on a sale is not modeled."
            >
              <ScenarioCompareTable
                scenarios={planning.scenarios}
                baselineTax={baselineHeadlineTax(toBe)}
                currency={toBe?.currency ?? "BRL"}
                proUnlocked={planning.proUnlocked}
              />
            </DashboardPanel>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <DashboardPanel
            title="Residency status requires further analysis"
            description="These are the signals your answers produced, not a determination."
            action={<StatusBadge tone="warning">Open question</StatusBadge>}
          >
            <dl className="space-y-4">
              {signals.map((signal) => (
                <div key={signal.label} className="border-b border-surface-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-navy-700/75">{signal.label}</dt>
                    <dd className="text-sm font-semibold text-navy">{signal.value}</dd>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-navy-700/65">{signal.note}</p>
                </div>
              ))}
            </dl>
          </DashboardPanel>
          <DashboardPanel title="Timeline" description="Dates you provided, in order. Gaps are expected at this stage.">
            <ResidencyTimeline events={timeline} />
          </DashboardPanel>
        </div>

        <div className="mt-8">
          <DashboardPanel
            title="Global financial map"
            description="Where your financial life touches down. Country-by-country allocation of each item can be refined later."
          >
            <div className="grid gap-4 md:grid-cols-3">
              {blocks.map((block) => (
                <CountryCard key={block.key} block={block} />
              ))}
            </div>
          </DashboardPanel>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <DashboardPanel
            title="Preliminary findings"
            description={
              toBe
                ? "Engine obligations and risks after the impact assessment run. Interview heuristics stay available before you run the report."
                : "What the assessment can already say, and what it cannot."
            }
          >
            {findings.map((finding) => (
              <FindingRow key={finding.label} finding={finding} />
            ))}
          </DashboardPanel>
          <DashboardPanel
            title="Potential analysis areas"
            description="Areas a professional would probably look at. Highlighted ones follow from your answers."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {areas.map((area) => (
                <AnalysisAreaCard key={area.label} area={area} />
              ))}
            </div>
          </DashboardPanel>
        </div>

        <div className="mt-8">
          <DisclaimerBox variant="critical">
            No exemption, credit or relief shown here is confirmed. Everything is described as
            potential because a professional has not yet reviewed the documents.
          </DisclaimerBox>
        </div>
      </div>
    </AssessmentShell>
  );
}
