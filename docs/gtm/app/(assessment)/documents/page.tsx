"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Ban, UploadCloud } from "lucide-react";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";
import ProgressBar from "@/components/ui/ProgressBar";
import DisclaimerBox from "@/components/ui/DisclaimerBox";
import StatusBadge from "@/components/ui/StatusBadge";
import { useDemoData } from "@/context/DemoDataProvider";
import { DOCUMENT_DEFS } from "@/lib/options";
import { documentsPercent, DOCUMENT_STATUS_LABELS } from "@/lib/derive";
import type { DocumentStatus } from "@/lib/types";

const STATUS_ORDER: DocumentStatus[] = [
  "available",
  "missing",
  "not_applicable",
  "needs_review",
];

const STATUS_STYLES: Record<DocumentStatus, string> = {
  available: "border-accent bg-accent-light text-accent-dark",
  missing: "border-alertRed/40 bg-alertRed-light text-alertRed",
  not_applicable: "border-surface-border bg-surface-muted text-navy-700",
  needs_review: "border-warn/40 bg-warn-light text-warn",
};

export default function DocumentsPage() {
  const router = useRouter();
  const { record, hydrated, setDocumentStatus, markDocumentsComplete } =
    useDemoData();
  const [dragging, setDragging] = useState(false);
  const [generating, setGenerating] = useState(false);

  const percent = documentsPercent(record);
  const reviewed = DOCUMENT_DEFS.filter((doc) => record.documents[doc.id]).length;

  const generate = () => {
    setGenerating(true);
    markDocumentsComplete();
    window.setTimeout(() => router.push("/dashboard"), 700);
  };

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
        <div className="h-2 w-full animate-pulse rounded bg-navy-100" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-hidden="true">
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-36 animate-pulse rounded-xl border border-surface-border bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 lg:px-8">
      <ProgressBar
        value={percent}
        label={`${reviewed} of ${DOCUMENT_DEFS.length} documents reviewed`}
      />

      <header className="mt-8">
        <h1 className="font-display text-2xl leading-tight text-navy sm:text-3xl">
          Organise your documents
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-700/80">
          Mark what you already have. Knowing a document is missing is as useful as
          having it — the gaps shape what a professional would ask for first.
        </p>
      </header>

      <div className="mt-6">
        <DisclaimerBox variant="critical" title="Demo only. File upload is disabled.">
          Nothing can be uploaded and nothing is stored. Only your choice of status is
          kept, in this browser.
        </DisclaimerBox>
      </div>

      {/* Simulated drop zone — intentionally inert */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        aria-hidden="true"
        className={`mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-alertRed/60 bg-alertRed-light"
            : "border-surface-border bg-white"
        }`}
      >
        {dragging ? (
          <>
            <Ban className="h-6 w-6 text-alertRed" />
            <p className="mt-3 text-sm font-semibold text-alertRed">
              Uploads are switched off in this prototype
            </p>
            <p className="mt-1 text-xs text-alertRed/80">
              Your file will not be read, stored or sent anywhere.
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-navy-700/40" />
            <p className="mt-3 text-sm font-medium text-navy-700/70">
              This is where uploads would go in the finished product
            </p>
            <p className="mt-1 text-xs text-navy-700/50">
              Disabled for the demo. Use the checklist below instead.
            </p>
          </>
        )}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DOCUMENT_DEFS.map((doc) => {
          const current = record.documents[doc.id];
          return (
            <fieldset
              key={doc.id}
              className="rounded-xl border border-surface-border bg-white p-5 shadow-card"
            >
              <legend className="sr-only">{doc.label}</legend>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-navy">{doc.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-navy-700/70">
                    {doc.description}
                  </p>
                </div>
                {current && (
                  <StatusBadge
                    tone={
                      current === "available"
                        ? "positive"
                        : current === "missing"
                          ? "critical"
                          : current === "needs_review"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {DOCUMENT_STATUS_LABELS[current]}
                  </StatusBadge>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS_ORDER.map((status) => {
                  const selected = current === status;
                  const id = `${doc.id}-${status}`;
                  return (
                    <label
                      key={status}
                      htmlFor={id}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                        selected
                          ? STATUS_STYLES[status]
                          : "border-surface-border bg-white text-navy-700/70 hover:border-navy-500/40 hover:text-navy"
                      }`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={doc.id}
                        className="sr-only"
                        checked={selected}
                        onChange={() => setDocumentStatus(doc.id, status)}
                      />
                      {DOCUMENT_STATUS_LABELS[status]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {reviewed === 0 && (
        <p className="mt-6 rounded-lg border border-surface-border bg-white px-4 py-3 text-sm text-navy-700/75">
          Nothing marked yet. Pick a status for any document above, or continue and
          the dashboard will treat every item as still to review.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 border-t border-surface-border pt-6 sm:flex-row-reverse sm:justify-between">
        <PrimaryButton onClick={generate} disabled={generating}>
          {generating ? "Building your tax map…" : "Generate demo tax map"}
          {!generating && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </PrimaryButton>
        <SecondaryButton href="/assessment">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to assessment
        </SecondaryButton>
      </div>
    </div>
  );
}
