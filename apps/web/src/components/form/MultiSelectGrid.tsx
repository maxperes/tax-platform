import { SelectionCard } from "../ui/SelectionCard";
import type { Option } from "../../lib/interview/types";

interface Props {
  name: string;
  label: string;
  values: string[];
  options: Option[];
  onChange: (values: string[]) => void;
}

export function MultiSelectGrid({ name, label, values, options, onChange }: Props) {
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  return (
    <fieldset>
      <legend className="sr-only">{label} — select all that apply</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <SelectionCard
            key={option.value}
            id={`${name}-${option.value}`}
            label={option.label}
            description={option.description}
            selected={values.includes(option.value)}
            onToggle={() => toggle(option.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}
