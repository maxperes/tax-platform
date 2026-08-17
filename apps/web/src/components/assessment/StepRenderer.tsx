import { QuestionCard } from "../ui/QuestionCard";
import { Field } from "../form/Field";
import { RadioGroup } from "../form/RadioGroup";
import { MultiSelectGrid } from "../form/MultiSelectGrid";
import { NotSureToggle } from "../form/NotSureToggle";
import { NOT_SURE, type AnswerValue, type StepDef } from "../../lib/interview/types";

interface Props {
  step: StepDef;
  answers: Record<string, AnswerValue | undefined>;
  errors: Record<string, string>;
  onAnswer: (id: string, value: AnswerValue | undefined) => void;
}

export function StepRenderer({ step, answers, errors, onAnswer }: Props) {
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
            htmlFor={question.type === "multiselect" || question.type === "radio" ? undefined : question.id}
            asGroup={question.type === "multiselect" || question.type === "radio"}
            required={question.required}
            error={error}
          >
            {question.type === "multiselect" ? (
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
