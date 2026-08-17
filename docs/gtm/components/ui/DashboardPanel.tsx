import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export default function DashboardPanel({
  title,
  description,
  action,
  children,
}: Props) {
  return (
    <section className="rounded-xl border border-surface-border bg-white shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-6 py-5">
        <div>
          <h2 className="font-display text-lg text-navy">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-navy-700/75">{description}</p>
          )}
        </div>
        {action}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}
