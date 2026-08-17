import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, UploadCloud } from "lucide-react";
import { api } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { AssessmentShell } from "../components/layout/AssessmentShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { ProgressBar } from "../components/ui/ProgressBar";
import { DisclaimerBox } from "../components/ui/DisclaimerBox";
import { StatusBadge } from "../components/ui/StatusBadge";
import { DOCUMENT_DEFS } from "../lib/interview/options";
import { DOCUMENT_STATUS_LABELS, documentsPercent, interviewNavStatus } from "../lib/interview/derive";
import { interviewToTwin, parseInterviewRecord } from "../lib/interview/interview-to-twin";
import type { DocumentStatus, InterviewRecord } from "../lib/interview/types";
import { openOrCreateCopilotSession } from "../lib/copilot";

const STATUS_ORDER: DocumentStatus[] = ["available", "missing", "not_applicable", "needs_review"];

const STATUS_STYLES: Record<DocumentStatus, string> = {
  available: "border-accent bg-accent-light text-accent-dark",
  missing: "border-alertRed/40 bg-alertRed-light text-alertRed",
  not_applicable: "border-surface-border bg-surface-muted text-navy-700",
  needs_review: "border-warn/40 bg-warn-light text-warn"
};

type TwinCase = {
  id: string;
  taxYear: number;
  interviewJson?: unknown;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1]! : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function DocumentsPage() {
  const { twinId } = useParams<{ twinId: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const taxYear = new Date().getFullYear();

  const twinQuery = useQuery({
    queryKey: ["twin", twinId],
    queryFn: () => api<TwinCase>(`/api/twins/${twinId}`),
    enabled: Boolean(twinId)
  });

  const twin = twinQuery.data;
  const record = parseInterviewRecord(twin?.interviewJson);
  const navStatus = interviewNavStatus(record);
  const percent = documentsPercent(record);
  const reviewed = DOCUMENT_DEFS.filter((doc) => record.documents[doc.id]).length;

  const saveRecord = async (next: InterviewRecord) => {
    if (!twin) return;
    const mapped = interviewToTwin(next);
    await api("/api/twins", {
      method: "PUT",
      body: JSON.stringify({
        taxYear: twin.taxYear,
        inventory: mapped.inventory,
        persons: mapped.persons,
        interview: next
      })
    });
    await qc.invalidateQueries({ queryKey: ["twin", twinId] });
  };

  const setStatus = (id: string, status: DocumentStatus) => {
    const next = { ...record, documents: { ...record.documents, [id]: status } };
    void saveRecord(next);
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ file, docId }: { file: File; docId: string }) => {
      if (!twin) throw new Error("Missing case");
      const def = DOCUMENT_DEFS.find((item) => item.id === docId);
      const contentBase64 = await fileToBase64(file);
      const doc = await api<{ id: string }>("/api/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          taxYear: twin.taxYear,
          kind: def?.kind ?? "other",
          twinCaseId: twin.id,
          originalFileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64
        })
      });
      await api(`/api/documents/${doc.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ mergeIntoTwin: true })
      });
      await saveRecord({
        ...record,
        documents: { ...record.documents, [docId]: "available" }
      });
      return doc;
    }
  });

  async function continueToMap() {
    await saveRecord({ ...record, documentsComplete: true, assessmentComplete: true });
    nav(`/impact/${twinId}/map`);
  }

  if (twinQuery.isLoading || !twin) return <LoadingShell message="Loading documents…" />;

  return (
    <AssessmentShell
      twinId={twin.id}
      assessmentStatus={navStatus.assessment}
      documentsStatus={navStatus.documents}
      mapStatus={navStatus.map}
      reportStatus={navStatus.report}
      onAskCopilot={async () => nav(`/chat/${await openOrCreateCopilotSession(taxYear)}`)}
    >
      <div className="mx-auto max-w-4xl px-5 py-10 lg:px-8">
        <ProgressBar value={percent} label={`${reviewed} of ${DOCUMENT_DEFS.length} documents reviewed`} />
        <header className="mt-8">
          <p className="eyebrow">Documents</p>
          <h1 className="mt-2 font-display text-2xl leading-tight text-navy sm:text-3xl">
            Organise your documents
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-700/80">
            Mark what you already have. Knowing a document is missing is as useful as having it —
            the gaps shape what a professional would ask for first.
          </p>
        </header>

        <div className="mt-6">
          <DisclaimerBox variant="info">
            You can upload a file for any item marked available. Extraction is heuristic for now;
            the checklist status is the source of truth.
          </DisclaimerBox>
        </div>

        {uploadMutation.isError && (
          <p className="mt-4 text-sm text-alertRed">
            {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Upload failed"}
          </p>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DOCUMENT_DEFS.map((doc) => {
            const current = record.documents[doc.id];
            return (
              <fieldset key={doc.id} className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
                <legend className="sr-only">{doc.label}</legend>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy">{doc.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-navy-700/70">{doc.description}</p>
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
                        className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          selected
                            ? STATUS_STYLES[status]
                            : "border-surface-border bg-white text-navy-700/70 hover:border-navy-500/40"
                        }`}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={doc.id}
                          className="sr-only"
                          checked={selected}
                          onChange={() => setStatus(doc.id, status)}
                        />
                        {DOCUMENT_STATUS_LABELS[status]}
                      </label>
                    );
                  })}
                </div>
                {current === "available" && (
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-surface-border px-3 py-2 text-xs font-medium text-navy-700 hover:border-accent">
                    <UploadCloud className="h-4 w-4" aria-hidden="true" />
                    {uploadMutation.isPending ? "Uploading…" : "Upload file"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadMutation.mutate({ file, docId: doc.id });
                      }}
                    />
                  </label>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-surface-border pt-6 sm:flex-row-reverse sm:justify-between">
          <PrimaryButton onClick={() => void continueToMap()}>
            Generate tax map
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
          <SecondaryButton href={`/impact/${twinId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to interview
          </SecondaryButton>
        </div>
      </div>
    </AssessmentShell>
  );
}
