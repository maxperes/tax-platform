import type { ChangeEvent } from "react";
import type { Option } from "../../lib/interview/types";

interface Props {
  id: string;
  type: "text" | "date" | "number" | "select";
  value: string;
  options?: Option[];
  placeholder?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export function Field({ id, type, value, options = [], placeholder, invalid, onChange }: Props) {
  const handle = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.target.value);

  if (type === "select") {
    return (
      <select id={id} className="field-input" value={value} onChange={handle} aria-invalid={invalid}>
        <option value="">Select an option</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      type={type}
      className="field-input"
      value={value}
      placeholder={placeholder}
      onChange={handle}
      aria-invalid={invalid}
      min={type === "number" ? 0 : undefined}
      autoComplete="off"
    />
  );
}
