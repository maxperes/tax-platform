"use client";

import {
  Building2,
  FileWarning,
  Gauge,
  Globe2,
  Landmark,
  Wallet,
} from "lucide-react";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";
import SummaryCard from "@/components/ui/SummaryCard";
import DashboardPanel from "@/components/ui/DashboardPanel";
import DisclaimerBox from "@/components/ui/DisclaimerBox";
import StatusBadge from "@/components/ui/StatusBadge";
import ResidencyTimeline from "@/components/dashboard/ResidencyTimeline";
import CountryCard from "@/components/dashboard/CountryCard";
import FindingRow from "@/components/dashboard/FindingRow";
import AnalysisAreaCard from "@/components/dashboard/AnalysisAreaCard";
import { useDemoData } from "@/context/DemoDataProvider";
import { recordForDisplay } from "@/lib/fallback";
import {
  analysisAreas,
  countriesIdentified,
  countryBlocks,
  documentsNeedingAttention,
  overallPercent,
  preliminaryFindings,
  residencySignals,
  residencyTimeline,
  selectedAssets,
  selectedIncome,
} from "@/lib/derive";

export default function DashboardPage() {
  const { record, hydrated } = useDemoData();
  const { data, isSample } = recordForDisplay(record);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-content px-5 py-12 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <div
              key={key}
              className="h-32 animate-pulse rounded-xl border border-surface-border bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const countries = countriesIdentified(data);
  const income = selectedIncome(data);
  const assets = selectedAssets(data);
  const attention = documentsNeedingAttention(data);
  const findings = preliminaryFindings(data);
  const areas = analysisAreas(data);
  const blocks = countryBlocks(data);
  const signals = residencySignals(data);
  const timeline = residencyTimeline(data);

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Preliminary tax map</p>
          <h1 className="mt-2 font-display text-2xl leading-tight text-navy sm:text-3xl">
            Your 360° view
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-700/80">
            Everything below is assembled from your answers. No amount has been
            calculated and no position has been decided.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrimaryButton href="/report">View preliminary report</PrimaryButton>
          <SecondaryButton href="/assessment">Edit assessment</SecondaryButton>
          <SecondaryButton href="/documents">Review documents</SecondaryButton>
        </div>
      </header>

      {isSample && (
        <div className="mt-6">
          <DisclaimerBox variant="info" title="Showing a sample profile">
            You have not answered anything yet, so this dashboard uses an invented
            retiree profile. Start the assessment to see your own answers here.
          </DisclaimerBox>
        </div>
      )}

      {/* Summary cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          label="Assessment completion"
          value={`${overallPercent(data)}%`}
          hint="Questionnaire and document checklist combined."
          icon={<Gauge className="h-4 w-4" />}
        />
        <SummaryCard
          label="Possible Brazil tax residency"
          value="Requires analysis"
          hint="Never concluded from a questionnaire alone."
          icon={<Landmark className="h-4 w-4" />}
        />
        <SummaryCard
          label="Countries identified"
          value={countries.length}
          hint={countries.join(", ")}
          icon={<Globe2 className="h-4 w-4" />}
        />
        <SummaryCard
          label="Income categories"
          value={income.length}
          hint={
            income.length > 0
              ? income.map((item) => item.label).join(", ")
              : "None selected yet."
          }
          icon={<Wallet className="h-4 w-4" />}
        />
        <SummaryCard
          label="Asset categories"
          value={assets.length}
          hint={
            assets.length > 0
              ? assets.map((item) => item.label).join(", ")
              : "None selected yet."
          }
          icon={<Building2 className="h-4 w-4" />}
        />
        <SummaryCard
          label="Documents requiring attention"
          value={attention.length}
          hint={
            attention.length > 0
              ? attention.join(", ")
              : "Nothing flagged in the checklist."
          }
          icon={<FileWarning className="h-4 w-4" />}
        />
      </div>

      {/* Residency */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <DashboardPanel
          title="Residency status requires further analysis"
          description="These are the signals your answers produced, not a determination."
          action={<StatusBadge tone="warning">Open question</StatusBadge>}
        >
          <dl className="space-y-4">
            {signals.map((signal) => (
              <div
                key={signal.label}
                className="border-b border-surface-border pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm text-navy-700/75">{signal.label}</dt>
                  <dd className="text-sm font-semibold text-navy">{signal.value}</dd>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-navy-700/65">
                  {signal.note}
                </p>
              </div>
            ))}
          </dl>
        </DashboardPanel>

        <DashboardPanel
          title="Timeline"
          description="Dates you provided, in order. Gaps are expected at this stage."
        >
          <ResidencyTimeline events={timeline} />
        </DashboardPanel>
      </div>

      {/* Global financial map */}
      <div className="mt-8">
        <DashboardPanel
          title="Global financial map"
          description="Where your financial life touches down. Country-by-country allocation of each item is not part of this prototype."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {blocks.map((block) => (
              <CountryCard key={block.key} block={block} />
            ))}
          </div>
        </DashboardPanel>
      </div>

      {/* Findings */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <DashboardPanel
          title="Preliminary findings"
          description="What the assessment can already say, and what it cannot."
        >
          <div>
            {findings.map((finding) => (
              <FindingRow key={finding.label} finding={finding} />
            ))}
          </div>
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
          No exemption, credit or relief shown here is confirmed. Everything is
          described as potential because the analysis has not been performed.
        </DisclaimerBox>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-surface-border pt-6 sm:flex-row">
        <PrimaryButton href="/report">View preliminary report</PrimaryButton>
        <SecondaryButton href="/assessment">Edit assessment</SecondaryButton>
        <SecondaryButton href="/documents">Review documents</SecondaryButton>
      </div>
    </div>
  );
}
