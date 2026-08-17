import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "positive" | "info" | "warning" | "critical";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-navy-700 border-surface-border",
  positive: "bg-accent-light text-accent-dark border-accent/30",
  info: "bg-navy-100 text-navy-700 border-navy-500/20",
  warning: "bg-warn-light text-warn border-warn/30",
  critical: "bg-alertRed-light text-alertRed border-alertRed/30",
};

interface Props {
  children: ReactNode;
  tone?: BadgeTone;
}

export default function StatusBadge({ children, tone = "neutral" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
