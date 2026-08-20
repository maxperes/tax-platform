import type { ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  onClose?: () => void;
  resultsBlock?: ReactNode;
  children?: ReactNode;
};

const DOMAIN_STATES = ["patrimony", "transfers", "trust_registry", "entity_simulation"] as const;

export function hasChatWorkspaceContent(opts: {
  sessionState: string;
  hasResultsBlock: boolean;
}): boolean {
  const { sessionState, hasResultsBlock } = opts;
  return (
    hasResultsBlock ||
    (DOMAIN_STATES as readonly string[]).includes(sessionState) ||
    sessionState === "income_capture" ||
    sessionState === "deductions"
  );
}

export function ChatWorkspacePanel({
  title,
  description,
  onClose,
  resultsBlock,
  children
}: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-muted/40">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-border bg-white px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="font-display text-lg text-navy">{title}</p>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-navy-700/75">{description}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-surface-border p-1.5 text-navy hover:border-accent lg:hidden"
            aria-label="Close details"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="chat-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {resultsBlock}
        {children}
      </div>
    </div>
  );
}
