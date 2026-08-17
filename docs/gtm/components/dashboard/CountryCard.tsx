import StatusBadge from "@/components/ui/StatusBadge";
import type { CountryBlock } from "@/lib/derive";

export default function CountryCard({ block }: { block: CountryBlock }) {
  const rows = [
    { label: "Income categories", value: String(block.incomeCount) },
    { label: "Asset categories", value: String(block.assetCount) },
    { label: "Taxes paid", value: block.taxesPaid },
    { label: "Documents available", value: String(block.documentsAvailable) },
  ];

  return (
    <article
      className={`rounded-xl border p-5 ${
        block.active
          ? "border-surface-border bg-white shadow-card"
          : "border-dashed border-surface-border bg-surface-muted"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base text-navy">{block.name}</h3>
        <StatusBadge tone={block.active ? "info" : "neutral"}>
          {block.active ? "Identified" : "Not reported"}
        </StatusBadge>
      </div>
      <dl className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-xs text-navy-700/70">{row.label}</dt>
            <dd className="text-sm font-medium tabular-nums text-navy">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-surface-border pt-3 text-xs leading-relaxed text-navy-700/65">
        {block.note}
      </p>
    </article>
  );
}
