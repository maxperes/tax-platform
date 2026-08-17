"use client";

import QuestionCard from "@/components/ui/QuestionCard";
import Field from "@/components/form/Field";
import RadioGroup from "@/components/form/RadioGroup";
import MultiSelectGrid from "@/components/form/MultiSelectGrid";
import NotSureToggle from "@/components/form/NotSureToggle";
import { useDemoData } from "@/context/DemoDataProvider";
import { NOT_SURE } from "@/lib/types";
import type { AnswerValue, StepDef } from "@/lib/types";

interface Props {
  step: StepDef;
  errors: Record<string, string>;
}

export default function StepRenderer({ step, errors }: Props) {
  const { record, setAnswer } = useDemoData();

  const valueOf = (id: string): AnswerValue | undefined => record.answers[id];

  return (
    <div className="space-y-4">
      {step.questions.map((question) => {
        const raw = valueOf(question.id);
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
                onChange={(values) => setAnswer(question.id, values)}
              />
            ) : question.type === "radio" ? (
              <RadioGroup
                name={question.id}
                label={question.label}
                value={isNotSure ? "" : stringValue}
                options={question.options ?? []}
                onChange={(value) => setAnswer(question.id, value)}
              />
            ) : (
              <Field
                id={question.id}
                type={question.type}
                value={stringValue}
                options={question.options}
                placeholder={question.placeholder}
                invalid={Boolean(error)}
                onChange={(value) => setAnswer(question.id, value || undefined)}
              />
            )}

            {question.allowNotSure && (
              <NotSureToggle
                id={`${question.id}-not-sure`}
                active={isNotSure}
                onToggle={() =>
                  setAnswer(question.id, isNotSure ? undefined : NOT_SURE)
                }
              />
            )}
          </QuestionCard>
        );
      })}
    </div>
  );
}
