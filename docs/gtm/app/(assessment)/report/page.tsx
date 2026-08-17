"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, CircleDot } from "lucide-react";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";
import DisclaimerBox from "@/components/ui/DisclaimerBox";
import StatusBadge from "@/components/ui/StatusBadge";
import ReviewModal from "@/components/ui/ReviewModal";
import { useDemoData } from "@/context/DemoDataProvider";
import { recordForDisplay } from "@/lib/fallback";
import { COUNTRY_OPTIONS, labelFor } from "@/lib/options";
import {
  asString,
  attentionIndicators,
  ATTENTION_LABELS,
  countriesIdentified,
  documentsByStatus,
  missingInformation,
  preliminaryObservations,
  selectedAssets,
  selectedIncome,
} from "@/lib/derive";
import { NOT_SURE } from "@/lib/types";

const PLANNING_AREAS = [
  {
    title: "Pre-migration planning",
    body: "Decisions taken before a move often have more effect than anything done afterwards.",
  },
  {
    title: "Foreign tax credit review",
    body: "Whether tax already paid abroad can be set against a Brazilian liability, and on what evidence.",
  },
  {
    title: "Investment classification",
    body: "How each account and instrument is characterised under Brazilian rules.",
  },
  {
    title: "Retirement distribution timing",
    body: "When benefits are drawn can matter as much as how much is drawn.",
  },
  {
    title: "Corporate structure review",
    body: "Whether existing holding structures still make sense from both sides.",
  },
  {
    title: "Capital gain timing",
    body: "The year a disposal falls into can change the analysis considerably.",
  },
];

const ATTENTION_TONES = {
  low_attention: "positive",
  review_recommended: "warning",
  professional_analysis_required: "critical",
} as const;

function Section({
  title,
  children,
  eyebrow,
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

export default function ReportPage() {
  const { record, hydrated, markReviewRequested } = useDemoData();
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isSample } = recordForDisplay(record);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <div className="space-y-4" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-40 animate-pulse rounded-xl border border-surface-border bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const countries = countriesIdentified(data);
  const income = selectedIncome(data);
  const assets = selectedAssets(data);
  const observations = preliminaryObservations(data);
  const missing = missingInformation(data);
  const indicators = attentionIndicators(data);
  const available = documentsByStatus(data, "available");
  const notApplicable = documentsByStatus(data, "not_applicable");

  const immigrationStatus = asString(data, "immigration_status");
  const filingCountry = asString(data, "last_filing_country");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Preliminary report</p>
          <h1 className="mt-2 font-display text-3xl leading-tight text-navy">
            Brazilian tax position — preliminary map
          </h1>
        </div>
        <StatusBadge tone="warning">Demonstration</StatusBadge>
      </header>

      {isSample && (
        <div className="mt-6">
          <DisclaimerBox variant="info" title="Sample profile">
            This report is built from an invented retiree profile because you have not
            answered the questionnaire yet.
          </DisclaimerBox>
        </div>
      )}

      <div className="mt-8">
        <Section title="Executive overview">
          <p className="text-base leading-relaxed text-navy-700/85">
            This is a preliminary map, not an analysis. It organises what you told us
            into the categories a Brazilian tax review would work through, and marks
            the places where a judgement is needed. Nothing here has been calculated,
            verified against documents, or checked against a treaty.
          </p>
          <p className="mt-4 text-base leading-relaxed text-navy-700/85">
            The most useful part is usually the list of what is missing. That is what
            determines whether a professional can reach a conclusion quickly or has to
            start by collecting paperwork.
          </p>
        </Section>

        <Section title="Information considered" eyebrow="Inputs">
          <dl className="divide-y divide-surface-border rounded-xl border border-surface-border bg-white">
            {[
              { label: "Countries", value: countries.join(", ") || "None identified" },
              {
                label: "Immigration information",
                value:
                  immigrationStatus && immigrationStatus !== NOT_SURE
                    ? immigrationStatus.replace(/_/g, " ")
                    : "Not confirmed",
              },
              {
                label: "Income categories",
                value:
                  income.map((item) => item.label).join(", ") || "None selected",
              },
              {
                label: "Assets",
                value: assets.map((item) => item.label).join(", ") || "None selected",
              },
              {
                label: "Tax filings",
                value:
                  filingCountry && filingCountry !== "none" && filingCountry !== NOT_SURE
                    ? `Last return filed in ${labelFor(COUNTRY_OPTIONS, filingCountry)}`
                    : "No prior filing reported",
              },
              {
                label: "Documents available",
                value: available.join(", ") || "None marked as available",
              },
              {
                label: "Documents not applicable",
                value: notApplicable.join(", ") || "None marked",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] sm:gap-6"
              >
                <dt className="text-sm text-navy-700/75">{row.label}</dt>
                <dd className="text-sm font-medium capitalize text-navy">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Preliminary observations" eyebrow="What stands out">
          <ul className="space-y-3">
            {observations.map((observation) => (
              <li
                key={observation}
                className="flex gap-3 rounded-lg border border-surface-border bg-white px-4 py-3"
              >
                <CircleDot
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span className="text-sm leading-relaxed text-navy-700">
                  {observation}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Missing information" eyebrow="Gaps">
          {missing.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light px-4 py-3">
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-accent-dark"
                aria-hidden="true"
              />
              <p className="text-sm text-navy">
                Every question was answered and every document reviewed.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-navy-700/80">
                {missing.length} item{missing.length === 1 ? "" : "s"} would need
                resolving before any conclusion could be reached.
              </p>
              <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-surface-border bg-white p-4">
                {missing.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-navy-700">
                    <CircleAlert
                      className="mt-0.5 h-4 w-4 shrink-0 text-warn"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section title="Potential planning areas" eyebrow="Where value usually sits">
          <div className="grid gap-3 sm:grid-cols-2">
            {PLANNING_AREAS.map((area) => (
              <article
                key={area.title}
                className="rounded-lg border border-surface-border bg-white p-4"
              >
                <h3 className="text-sm font-semibold text-navy">{area.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-navy-700/75">
                  {area.body}
                </p>
              </article>
            ))}
          </div>
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
                  <p className="mt-1 text-xs leading-relaxed text-navy-700/70">
                    {indicator.note}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge tone={ATTENTION_TONES[indicator.level]}>
                    {ATTENTION_LABELS[indicator.level]}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Disclaimer">
          <DisclaimerBox variant="critical">
            This report is a demonstration generated from limited and potentially
            fictitious information. It does not constitute legal, tax or accounting
            advice. No filing or financial decision should be based on this report
            without professional review.
          </DisclaimerBox>
        </Section>
      </div>

      <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
        <h2 className="font-display text-xl text-navy">
          Hand this over to a professional
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-navy-700/80">
          A reviewer receives your answers, your document checklist and the points
          flagged above, and starts from an organised file.
        </p>
        {record.reviewRequested && (
          <p className="mt-4 text-sm font-medium text-navy">
            You already sent a demo request from this browser.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <PrimaryButton onClick={() => setModalOpen(true)}>
            Request professional review
          </PrimaryButton>
          <SecondaryButton href="/dashboard">Back to dashboard</SecondaryButton>
        </div>
      </div>

      <ReviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmitted={markReviewRequested}
      />
    </div>
  );
}
