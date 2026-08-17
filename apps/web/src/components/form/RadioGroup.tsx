import type { Option } from "../../lib/interview/types";

interface Props {
  name: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

export function RadioGroup({ name, label, value, options, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
              selected
                ? "border-accent bg-accent-light/60 text-navy"
                : "border-surface-border bg-white text-navy-700 hover:border-navy-500/40"
            }`}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 border-surface-border text-accent focus:outline-none"
            />
            <span className="font-medium">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
