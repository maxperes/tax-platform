import { Pencil } from "lucide-react";
import { NOT_SURE, type InterviewRecord, type QuestionDef, type StepDef } from "../../lib/interview/types";

function displayAnswer(question: QuestionDef, record: InterviewRecord): string {
  const value = record.answers[question.id];
  if (value === undefined) return "Not answered";
  if (value === NOT_SURE) return "I'm not sure";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Nothing selected";
    const labels = value.map((item) => {
      const option = question.options?.find((candidate) => candidate.value === item);
      return option ? option.label : item;
    });
    return labels.join(", ");
  }
  const option = question.options?.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}

interface Props {
  steps: StepDef[];
  record: InterviewRecord;
  onEditStep: (index: number) => void;
}

export function AssessmentSummary({ steps, record, onEditStep }: Props) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <section key={step.id} className="rounded-xl border border-surface-border bg-white shadow-card">
          <header className="flex items-center justify-between gap-4 border-b border-surface-border px-5 py-4">
            <h3 className="font-display text-base text-navy">{step.title}</h3>
            <button
              type="button"
              onClick={() => onEditStep(index)}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-accent-dark hover:bg-accent-light"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
              <span className="sr-only"> {step.title}</span>
            </button>
          </header>
          <dl className="divide-y divide-surface-border">
            {step.questions.map((question) => {
              const answer = displayAnswer(question, record);
              const unanswered = answer === "Not answered" || answer === "Nothing selected";
              return (
                <div
                  key={question.id}
                  className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-6"
                >
                  <dt className="text-sm text-navy-700/75">{question.label}</dt>
                  <dd className={`text-sm font-medium ${unanswered ? "text-navy-700/45" : "text-navy"}`}>
                    {answer}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
