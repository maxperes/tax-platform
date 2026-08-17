"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PrimaryButton from "@/components/ui/PrimaryButton";
import SecondaryButton from "@/components/ui/SecondaryButton";
import ProgressBar from "@/components/ui/ProgressBar";
import DisclaimerBox from "@/components/ui/DisclaimerBox";
import StepRenderer from "@/components/assessment/StepRenderer";
import AssessmentSummary from "@/components/assessment/AssessmentSummary";
import { useDemoData } from "@/context/DemoDataProvider";
import { STEPS } from "@/lib/questions";

const SUMMARY = STEPS.length;

export default function AssessmentPage() {
  const router = useRouter();
  const { record, hydrated, markAssessmentComplete } = useDemoData();
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  const onSummary = stepIndex === SUMMARY;
  const step = onSummary ? null : STEPS[stepIndex];

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIndex]);

  const validate = useCallback((): boolean => {
    if (!step) return true;
    const next: Record<string, string> = {};
    for (const question of step.questions) {
      if (!question.required) continue;
      const value = record.answers[question.id];
      const answered = Array.isArray(value)
        ? value.length > 0
        : typeof value === "string" && value.length > 0;
      if (!answered) {
        next[question.id] =
          question.type === "multiselect"
            ? "Select at least one option to continue."
            : "This answer is needed to continue.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [record.answers, step]);

  const goNext = () => {
    if (!validate()) return;
    setErrors({});
    setStepIndex((index) => Math.min(index + 1, SUMMARY));
  };

  const goBack = () => {
    setErrors({});
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const finish = () => {
    markAssessmentComplete();
    router.push("/documents");
  };

  const percent = onSummary
    ? 100
    : Math.round((stepIndex / STEPS.length) * 100);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 lg:px-8">
        <div className="h-2 w-full animate-pulse rounded bg-navy-100" />
        <div className="mt-8 space-y-4" aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-28 animate-pulse rounded-xl border border-surface-border bg-white"
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          Loading your saved answers
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <ProgressBar
        value={percent}
        label={
          onSummary
            ? "Review your answers"
            : `Step ${stepIndex + 1} of ${STEPS.length}`
        }
      />

      <header className="mt-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl leading-tight text-navy focus:outline-none sm:text-3xl"
        >
          {onSummary ? "Check your answers" : step?.title}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-navy-700/80">
          {onSummary
            ? "Nothing here is final. Edit any section, then continue to the document checklist."
            : step?.intro}
        </p>
      </header>

      <div className="mt-8">
        {onSummary ? (
          <AssessmentSummary
            record={record}
            onEditStep={(index) => setStepIndex(index)}
          />
        ) : (
          step && <StepRenderer step={step} errors={errors} />
        )}
      </div>

      {stepIndex === 0 && (
        <div className="mt-6">
          <DisclaimerBox variant="warning">
            Use invented details. Never enter a real CPF, passport number or account
            number — this prototype does not ask for any of them.
          </DisclaimerBox>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <p className="mt-6 text-sm font-medium text-alertRed" role="alert">
          Some answers are still needed above before you can continue.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 border-t border-surface-border pt-6 sm:flex-row-reverse sm:justify-between">
        {onSummary ? (
          <PrimaryButton onClick={finish}>
            Continue to documents
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={goNext}>
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        )}

        {stepIndex > 0 ? (
          <SecondaryButton onClick={goBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </SecondaryButton>
        ) : (
          <SecondaryButton href="/start">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to overview
          </SecondaryButton>
        )}
      </div>

      <p className="mt-6 text-xs text-navy-700/60">
        Answers save automatically in this browser as you type. Nothing is sent
        anywhere.
      </p>
    </div>
  );
}
