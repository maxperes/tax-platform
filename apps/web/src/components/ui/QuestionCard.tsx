import type { ReactNode } from "react";

interface Props {
  label: string;
  help?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  asGroup?: boolean;
}

export function QuestionCard({ label, help, htmlFor, required, error, children, asGroup }: Props) {
  const heading = (
    <>
      {label}
      {required && (
        <span className="ml-1 text-accent-dark" aria-hidden="true">
          *
        </span>
      )}
    </>
  );

  return (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
      {asGroup ? (
        <p className="text-sm font-semibold text-navy">{heading}</p>
      ) : (
        <label htmlFor={htmlFor} className="text-sm font-semibold text-navy">
          {heading}
        </label>
      )}
      {help && <p className="mt-1 text-sm text-navy-700/70">{help}</p>}
      <div className="mt-4">{children}</div>
      {error && (
        <p className="mt-3 text-sm font-medium text-alertRed" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
