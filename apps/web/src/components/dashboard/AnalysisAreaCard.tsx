import { Minus, Search } from "lucide-react";
import type { AnalysisArea } from "../../lib/interview/derive";

export function AnalysisAreaCard({ area }: { area: AnalysisArea }) {
  return (
    <article
      className={`rounded-lg border p-4 ${
        area.relevant ? "border-accent/30 bg-accent-light/40" : "border-surface-border bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        {area.relevant ? (
          <Search className="h-4 w-4 text-accent-dark" aria-hidden="true" />
        ) : (
          <Minus className="h-4 w-4 text-navy-700/35" aria-hidden="true" />
        )}
        <h3 className="text-sm font-semibold text-navy">Potential: {area.label}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-navy-700/75">
        {area.relevant ? area.note : "Nothing in your answers points here yet."}
      </p>
    </article>
  );
}
