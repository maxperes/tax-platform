"use client";

import { Check } from "lucide-react";

interface Props {
  id: string;
  label: string;
  description?: string;
  selected: boolean;
  onToggle: () => void;
}

export default function SelectionCard({
  id,
  label,
  description,
  selected,
  onToggle,
}: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
        selected
          ? "border-accent bg-accent-light/60"
          : "border-surface-border bg-white hover:border-navy-500/40"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-accent bg-accent text-white"
            : "border-surface-border bg-white"
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-navy">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-navy-700/70">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
