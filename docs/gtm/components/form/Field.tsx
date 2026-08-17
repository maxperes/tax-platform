"use client";

import type { ChangeEvent } from "react";
import type { Option } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy placeholder:text-navy-700/40 focus:border-accent focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-accent";

interface Props {
  id: string;
  type: "text" | "date" | "number" | "select";
  value: string;
  options?: Option[];
  placeholder?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

export default function Field({
  id,
  type,
  value,
  options = [],
  placeholder,
  invalid,
  onChange,
}: Props) {
  const handle = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => onChange(event.target.value);

  if (type === "select") {
    return (
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={handle}
        aria-invalid={invalid}
      >
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
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={handle}
      aria-invalid={invalid}
      min={type === "number" ? 0 : undefined}
      autoComplete="off"
    />
  );
}
