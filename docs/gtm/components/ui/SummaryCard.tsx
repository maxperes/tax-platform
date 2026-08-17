import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

export default function SummaryCard({ label, value, hint, icon }: Props) {
  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">
          {label}
        </p>
        {icon && <span className="text-accent" aria-hidden="true">{icon}</span>}
      </div>
      <p className="mt-3 font-display text-2xl leading-tight text-navy">{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-navy-700/70">{hint}</p>}
    </div>
  );
}
