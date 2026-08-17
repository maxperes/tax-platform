import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "info" | "warning" | "critical";

const STYLES: Record<Variant, { box: string; icon: ReactNode }> = {
  info: {
    box: "border-navy-500/20 bg-navy-100/60 text-navy-700",
    icon: <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
  },
  warning: {
    box: "border-warn/30 bg-warn-light text-warn",
    icon: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
  },
  critical: {
    box: "border-alertRed/30 bg-alertRed-light text-alertRed",
    icon: <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
  }
};

interface Props {
  children: ReactNode;
  variant?: Variant;
  title?: string;
}

export function DisclaimerBox({ children, variant = "info", title }: Props) {
  const style = STYLES[variant];
  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed ${style.box}`}>
      <span className="mt-0.5">{style.icon}</span>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
