"use client";

import { HelpCircle } from "lucide-react";

interface Props {
  id: string;
  active: boolean;
  onToggle: () => void;
}

export default function NotSureToggle({ id, active, onToggle }: Props) {
  return (
    <button
      id={id}
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "border-accent bg-accent-light text-accent-dark"
          : "border-dashed border-surface-border bg-white text-navy-700/70 hover:border-navy-500/40 hover:text-navy"
      }`}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      I&rsquo;m not sure
    </button>
  );
}
