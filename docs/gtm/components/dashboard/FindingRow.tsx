import StatusBadge from "@/components/ui/StatusBadge";
import type { BadgeTone } from "@/components/ui/StatusBadge";
import { FINDING_LABELS } from "@/lib/derive";
import type { Finding } from "@/lib/derive";
import type { FindingStatus } from "@/lib/types";

const TONES: Record<FindingStatus, BadgeTone> = {
  information_complete: "positive",
  additional_document_needed: "warning",
  professional_review_recommended: "info",
  potential_tax_issue: "critical",
  not_yet_analyzed: "neutral",
};

export default function FindingRow({ finding }: { finding: Finding }) {
  return (
    <div className="flex flex-col gap-2 border-b border-surface-border py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-medium text-navy">{finding.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-navy-700/70">
          {finding.note}
        </p>
      </div>
      <div className="shrink-0">
        <StatusBadge tone={TONES[finding.status]}>
          {FINDING_LABELS[finding.status]}
        </StatusBadge>
      </div>
    </div>
  );
}
