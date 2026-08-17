import type { ReactNode } from "react";
import { Check, Circle, CircleDashed, MessageCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Footer } from "./Footer";
import type { StepStatus } from "../../lib/interview/types";

type Props = {
  twinId?: string;
  assessmentStatus?: StepStatus;
  documentsStatus?: StepStatus;
  mapStatus?: StepStatus;
  reportStatus?: StepStatus;
  onAskCopilot?: () => void;
  children: ReactNode;
};

const STATUS_TEXT: Record<StepStatus, string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started"
};

const ICONS: Record<StepStatus, ReactNode> = {
  complete: <Check className="h-3.5 w-3.5 text-accent-dark" aria-hidden="true" />,
  in_progress: <Circle className="h-3 w-3 text-navy-500" aria-hidden="true" />,
  not_started: <CircleDashed className="h-3.5 w-3.5 text-navy-700/40" aria-hidden="true" />
};

export function AssessmentShell({
  twinId,
  assessmentStatus = "not_started",
  documentsStatus = "not_started",
  mapStatus = "not_started",
  reportStatus = "not_started",
  onAskCopilot,
  children
}: Props) {
  const location = useLocation();
  const base = twinId ? `/impact/${twinId}` : "/impact";
  const items = [
    { href: base, label: "Interview", status: assessmentStatus, match: (p: string) => p === base || p === "/start" },
    { href: `${base}/documents`, label: "Documents", status: documentsStatus, match: (p: string) => p.endsWith("/documents") },
    { href: `${base}/map`, label: "Map", status: mapStatus, match: (p: string) => p.endsWith("/map") },
    { href: `${base}/report`, label: "Report", status: reportStatus, match: (p: string) => p.endsWith("/report") }
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header signedIn />
      <div className="border-b border-surface-border bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-5 lg:px-8">
          <nav aria-label="Assessment sections">
            <ul className="-mb-px flex gap-1 overflow-x-auto">
              {items.map((item) => {
                const active = item.match(location.pathname);
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      to={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-accent text-navy"
                          : "border-transparent text-navy-700/70 hover:border-navy-100 hover:text-navy"
                      }`}
                    >
                      {ICONS[item.status]}
                      <span>{item.label}</span>
                      <span className="sr-only">{STATUS_TEXT[item.status]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {onAskCopilot && (
            <button
              type="button"
              onClick={onAskCopilot}
              className="hidden shrink-0 items-center gap-2 rounded-lg border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-semibold text-accent-dark hover:bg-accent-light/80 sm:inline-flex"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Refine with copilot
            </button>
          )}
        </div>
      </div>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
