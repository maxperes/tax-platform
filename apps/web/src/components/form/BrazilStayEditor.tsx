import { useMemo } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import {
  MAX_BRAZIL_STAYS,
  collectBrazilStaysFromInterview,
  syncBrazilStaysToInterviewAnswers,
  type BrazilStay
} from "@tax-platform/shared";
import { Field } from "./Field";
import { NOT_SURE, type AnswerValue, type Answers } from "../../lib/interview/types";
import { api } from "../../api";

type Props = {
  answers: Answers;
  onBatchUpdate: (patch: Record<string, AnswerValue | undefined>) => void;
  invalid?: boolean;
  twinId?: string;
  taxYear?: number;
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

type ExtractedStay = BrazilStay & { confidence?: string; rawText?: string };

export function BrazilStayEditor({ answers, onBatchUpdate, invalid, twinId, taxYear }: Props) {
  const currentlyInBrazil = answers.currently_in_brazil === "yes";
  const record = useMemo(() => ({ answers }), [answers]);

  const stays = useMemo(() => collectBrazilStaysFromInterview(record) ?? [], [record]);

  const displayStays: BrazilStay[] =
    stays.length > 0
      ? stays
      : [{ entryDate: "", exitDate: currentlyInBrazil ? undefined : "" }];

  const applyStays = (next: BrazilStay[]) => {
    const filtered = next.filter((s) => s.entryDate.trim().length > 0);
    const patch = syncBrazilStaysToInterviewAnswers(filtered, currentlyInBrazil);
    onBatchUpdate(patch);
  };

  const updateStay = (index: number, field: "entryDate" | "exitDate", value: string) => {
    const next = displayStays.map((stay, i) => {
      if (i !== index) return stay;
      if (field === "exitDate" && value === "") {
        return { entryDate: stay.entryDate, exitDate: undefined };
      }
      return { ...stay, [field]: value };
    });
    applyStays(next);
  };

  const addStay = () => {
    if (displayStays.length >= MAX_BRAZIL_STAYS) return;
    applyStays([...displayStays.filter((s) => s.entryDate), { entryDate: "" }]);
  };

  const removeStay = (index: number) => {
    const next = displayStays.filter((_, i) => i !== index);
    applyStays(next.length > 0 ? next : []);
  };

  const applyExtractedStays = (extracted: ExtractedStay[]) => {
    const normalized = extracted
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.entryDate))
      .map((s) => ({
        entryDate: s.entryDate,
        exitDate: s.exitDate && /^\d{4}-\d{2}-\d{2}$/.test(s.exitDate) ? s.exitDate : undefined
      }));
    if (normalized.length === 0) return;
    applyStays(normalized);
  };

  const handleStampUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !twinId || !taxYear) return;

    const contentBase64 = await fileToBase64(file);
    const doc = await api<{ id: string; extractedFactsJson?: { suggestions?: { residency?: { brazilStays?: ExtractedStay[] } } } }>(
      "/api/documents/upload",
      {
        method: "POST",
        body: JSON.stringify({
          taxYear,
          kind: "passport",
          twinCaseId: twinId,
          originalFileName: file.name,
          mimeType: file.type || "image/jpeg",
          contentBase64
        })
      }
    );

    const poll = async (attempts: number): Promise<void> => {
      if (attempts <= 0) return;
      const listed = await api<Array<{ id: string; extractedFactsJson?: unknown }>>(
        `/api/documents?taxYear=${taxYear}`
      );
      const updated = listed.find((d) => d.id === doc.id);
      const facts = updated?.extractedFactsJson as
        | { suggestions?: { residency?: { brazilStays?: ExtractedStay[] } }; status?: string }
        | undefined;
      const extracted = facts?.suggestions?.residency?.brazilStays;
      if (extracted && extracted.length > 0) {
        applyExtractedStays(extracted);
        return;
      }
      if (facts?.status === "pending") {
        await new Promise((r) => setTimeout(r, 1500));
        return poll(attempts - 1);
      }
    };

    const immediate = doc.extractedFactsJson?.suggestions?.residency?.brazilStays;
    if (immediate && immediate.length > 0) {
      applyExtractedStays(immediate);
    } else {
      await poll(8);
    }
  };

  return (
    <div className="space-y-4">
      {displayStays.map((stay, index) => {
        const isLast = index === displayStays.length - 1;
        const exitOptional = isLast && currentlyInBrazil;
        const exitValue =
          answers[`brazil_trip_${index + 1}_exit`] === NOT_SURE
            ? ""
            : (stay.exitDate ?? "");

        return (
          <div
            key={index}
            className="rounded-lg border border-surface-border bg-surface-muted/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-navy">Stay {index + 1}</p>
              {displayStays.length > 1 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-navy-700/70 hover:text-alertRed"
                  onClick={() => removeStay(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`stay-${index}-entry`} className="mb-1 block text-xs text-navy-700/70">
                  Date entered Brazil
                </label>
                <Field
                  id={`stay-${index}-entry`}
                  type="date"
                  value={stay.entryDate}
                  invalid={invalid && !stay.entryDate}
                  onChange={(value) => updateStay(index, "entryDate", value)}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor={`stay-${index}-exit`} className="block text-xs text-navy-700/70">
                    Date left Brazil
                    {exitOptional ? " (optional)" : ""}
                  </label>
                  {exitValue && (
                    <button
                      type="button"
                      className="text-xs font-medium text-navy-700/70 hover:text-alertRed"
                      onClick={() => updateStay(index, "exitDate", "")}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Field
                  id={`stay-${index}-exit`}
                  type="date"
                  value={exitValue}
                  invalid={false}
                  onChange={(value) => updateStay(index, "exitDate", value)}
                />
                {exitOptional && (
                  <p className="mt-1 text-xs text-navy-700/60">Leave blank if you are still in Brazil.</p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {displayStays.length < MAX_BRAZIL_STAYS && (
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-dark"
          onClick={addStay}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add another stay
        </button>
      )}

      {twinId && taxYear && (
        <div className="rounded-lg border border-dashed border-surface-border p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-navy">
            <Camera className="h-4 w-4 text-accent" aria-hidden="true" />
            Upload passport stamp photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void handleStampUpload(e)}
            />
          </label>
          <p className="mt-1 text-xs text-navy-700/60">
            We read Brazil entry and exit stamps when possible. Review dates before continuing.
          </p>
        </div>
      )}
    </div>
  );
}
