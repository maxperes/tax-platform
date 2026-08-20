import { QuestionCard } from "../ui/QuestionCard";
import { Field } from "../form/Field";
import { RadioGroup } from "../form/RadioGroup";
import { MultiSelectGrid } from "../form/MultiSelectGrid";
import { NotSureToggle } from "../form/NotSureToggle";
import { BrazilStayEditor } from "../form/BrazilStayEditor";
import { collectBrazilStaysFromInterview } from "@tax-platform/shared";
import { NOT_SURE, type AnswerValue, type StepDef } from "../../lib/interview/types";

interface Props {
  step: StepDef;
  answers: Record<string, AnswerValue | undefined>;
  errors: Record<string, string>;
  onAnswer: (id: string, value: AnswerValue | undefined) => void;
  onBatchAnswer?: (patch: Record<string, AnswerValue | undefined>) => void;
  twinId?: string;
  taxYear?: number;
}

export function StepRenderer({
  step,
  answers,
  errors,
  onAnswer,
  onBatchAnswer,
  twinId,
  taxYear
}: Props) {
  const batchUpdate =
    onBatchAnswer ??
    ((patch: Record<string, AnswerValue | undefined>) => {
      for (const [id, value] of Object.entries(patch)) onAnswer(id, value);
    });

  return (
    <div className="space-y-4">
      {step.questions.map((question) => {
        const raw = answers[question.id];
        const isNotSure = raw === NOT_SURE;
        const stringValue = typeof raw === "string" && !isNotSure ? raw : "";
        const listValue = Array.isArray(raw) ? raw : [];
        const error = errors[question.id];

        return (
          <QuestionCard
            key={question.id}
            label={question.label}
            help={question.help}
            htmlFor={
              question.type === "multiselect" || question.type === "radio" || question.type === "stays"
                ? undefined
                : question.id
            }
            asGroup={question.type === "multiselect" || question.type === "radio" || question.type === "stays"}
            required={question.required}
            error={error}
          >
            {question.type === "stays" ? (
              <BrazilStayEditor
                answers={answers}
                onBatchUpdate={batchUpdate}
                invalid={Boolean(error)}
                twinId={twinId}
                taxYear={taxYear}
              />
            ) : question.type === "multiselect" ? (
              <MultiSelectGrid
                name={question.id}
                label={question.label}
                values={listValue}
                options={question.options ?? []}
                onChange={(values) => onAnswer(question.id, values)}
              />
            ) : question.type === "radio" ? (
              <RadioGroup
                name={question.id}
                label={question.label}
                value={isNotSure ? "" : stringValue}
                options={question.options ?? []}
                onChange={(value) => onAnswer(question.id, value)}
              />
            ) : (
              <Field
                id={question.id}
                type={question.type}
                value={stringValue}
                options={question.options}
                placeholder={question.placeholder}
                invalid={Boolean(error)}
                onChange={(value) => onAnswer(question.id, value || undefined)}
              />
            )}

            {question.allowNotSure && (
              <NotSureToggle
                id={`${question.id}-not-sure`}
                active={isNotSure}
                onToggle={() => onAnswer(question.id, isNotSure ? undefined : NOT_SURE)}
              />
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}

/** Returns true when at least one stay has a valid entry date. */
export function hasValidBrazilStays(answers: Record<string, AnswerValue | undefined>): boolean {
  const stays = collectBrazilStaysFromInterview({ answers });
  return Boolean(stays && stays.length > 0);
}
