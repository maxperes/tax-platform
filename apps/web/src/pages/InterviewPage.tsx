import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { AssessmentShell } from "../components/layout/AssessmentShell";
import { StepRenderer, hasValidBrazilStays } from "../components/assessment/StepRenderer";
import { AssessmentSummary } from "../components/assessment/AssessmentSummary";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { ProgressBar } from "../components/ui/ProgressBar";
import { DisclaimerBox } from "../components/ui/DisclaimerBox";
import { asList, interviewNavStatus, interviewSteps } from "../lib/interview/derive";
import { interviewToTwin, parseInterviewRecord } from "../lib/interview/interview-to-twin";
import { emptyInterviewRecord, type AnswerValue, type InterviewRecord } from "../lib/interview/types";
import { openOrCreateCopilotSession } from "../lib/copilot";

type TwinCase = {
  id: string;
  taxYear: number;
  interviewJson?: unknown;
};

export function InterviewPage() {
  const { twinId } = useParams<{ twinId?: string }>();
  const nav = useNavigate();
  const taxYear = new Date().getFullYear();
  const [record, setRecord] = useState<InterviewRecord>(emptyInterviewRecord());
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveTimer = useRef<number | null>(null);
  const recordRef = useRef(record);
  recordRef.current = record;

  const twinQuery = useQuery({
    queryKey: ["twin", twinId, taxYear],
    queryFn: async () => {
      if (twinId) return api<TwinCase>(`/api/twins/${twinId}`);
      return api<TwinCase>("/api/twins/ensure", {
        method: "POST",
        body: JSON.stringify({ taxYear })
      });
    }
  });

  const twin = twinQuery.data;

  useEffect(() => {
    if (!twin) return;
    setRecord(parseInterviewRecord(twin.interviewJson));
    if (!twinId && twin.id) nav(`/impact/${twin.id}`, { replace: true });
  }, [twin?.id, twinId, nav, twin]);

  const steps = useMemo(() => interviewSteps(record), [record]);
  const onSummary = stepIndex >= steps.length;
  const step = onSummary ? null : steps[stepIndex];
  const navStatus = interviewNavStatus(record);
  const percent = onSummary ? 100 : Math.round((stepIndex / Math.max(steps.length, 1)) * 100);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIndex]);

  const persist = useCallback(
    async (next: InterviewRecord) => {
      if (!twin) return;
      const mapped = interviewToTwin(next);
      setSaving(true);
      try {
        await api("/api/twins", {
          method: "PUT",
          body: JSON.stringify({
            taxYear: twin.taxYear,
            inventory: mapped.inventory,
            persons: mapped.persons,
            interview: next
          })
        });
      } finally {
        setSaving(false);
      }
    },
    [twin]
  );

  const scheduleSave = useCallback(
    (next: InterviewRecord) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 400);
    },
    [persist]
  );

  const setAnswer = (id: string, value: AnswerValue | undefined) => {
    setRecord((current) => {
      const next = { ...current, answers: { ...current.answers, [id]: value } };
      scheduleSave(next);
      return next;
    });
  };

  const setAnswers = (patch: Record<string, AnswerValue | undefined>) => {
    setRecord((current) => {
      const next = { ...current, answers: { ...current.answers, ...patch } };
      scheduleSave(next);
      return next;
    });
  };

  const validate = (): boolean => {
    if (!step) return true;
    const next: Record<string, string> = {};
    for (const question of step.questions) {
      if (!question.required) continue;
      if (question.type === "stays") {
        if (!hasValidBrazilStays(record.answers)) {
          next[question.id] = "Add at least one Brazil entry date to continue.";
        }
        continue;
      }
      const value = record.answers[question.id];
      const answered = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
      if (!answered) {
        next[question.id] =
          question.type === "multiselect"
            ? "Select at least one option to continue."
            : "This answer is needed to continue.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validate()) return;
    setErrors({});
    setStepIndex((index) => Math.min(index + 1, steps.length));
  };

  const finish = async () => {
    const next = { ...record, assessmentComplete: true };
    setRecord(next);
    await persist(next);
    if (twin) nav(`/impact/${twin.id}/documents`);
  };

  async function askCopilot() {
    const id = await openOrCreateCopilotSession(taxYear);
    nav(`/chat/${id}`);
  }

  if (twinQuery.isLoading || !twin) return <LoadingShell message="Loading interview…" />;

  return (
    <AssessmentShell
      twinId={twin.id}
      assessmentStatus={navStatus.assessment}
      documentsStatus={navStatus.documents}
      mapStatus={navStatus.map}
      reportStatus={navStatus.report}
      onAskCopilot={() => void askCopilot()}
    >
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
        <ProgressBar
          value={onSummary ? 100 : percent}
          label={onSummary ? "Review your answers" : `Step ${stepIndex + 1} of ${steps.length}`}
        />
        <p className="mt-2 text-xs text-navy-700/60">{saving ? "Saving…" : "Answers save automatically."}</p>

        <header className="mt-8">
          <p className="eyebrow">Interview</p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 font-display text-2xl leading-tight text-navy sm:text-3xl"
          >
            {onSummary ? "Check what we have so far" : step?.title}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-navy-700/80">
            {onSummary
              ? "Edit any section before organising documents. Saying you are not sure is useful — it becomes a gap a professional can close."
              : step?.intro}
          </p>
        </header>

        <div className="mt-8">
          {onSummary ? (
            <AssessmentSummary
              steps={steps}
              record={record}
              onEditStep={(index) => {
                setStepIndex(index);
                setErrors({});
              }}
            />
          ) : (
            step && (
              <StepRenderer
                step={step}
                answers={record.answers}
                errors={errors}
                onAnswer={setAnswer}
                onBatchAnswer={setAnswers}
                twinId={twin.id}
                taxYear={twin.taxYear}
              />
            )
          )}
        </div>

        {asList(record, "income_types").includes("crypto") && step?.id === "income_sources" && (
          <div className="mt-6">
            <DisclaimerBox variant="info">
              Cryptocurrency often needs extra classification. The next step asks only for an
              approximate amount and country.
            </DisclaimerBox>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-surface-border pt-6 sm:flex-row-reverse sm:justify-between">
          {onSummary ? (
            <PrimaryButton onClick={() => void finish()}>
              Continue to documents
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={goNext}>
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </PrimaryButton>
          )}
          <SecondaryButton
            onClick={() => {
              setErrors({});
              setStepIndex((index) => Math.max(index - 1, 0));
            }}
            disabled={stepIndex === 0 && !onSummary}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </SecondaryButton>
        </div>
      </div>
    </AssessmentShell>
  );
}
