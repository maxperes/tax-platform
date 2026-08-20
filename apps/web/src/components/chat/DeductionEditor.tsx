import { useEffect, useState } from "react";

export type DeductionRow = {
  id: string;
  taxYear: number;
  deductionType: string;
  amount: string;
  currency: string;
  taxPeriod: string;
  applicationScope: "monthly" | "annual" | "transaction";
};

type Props = {
  rows: DeductionRow[];
  loading: boolean;
  savingId: string;
  error: string;
  onAddRow: () => void;
  onUpdate: (id: string, key: keyof DeductionRow, value: string) => void;
  onSave: (row: DeductionRow) => void;
};

const fieldClass = "w-full min-w-0 rounded-md border border-surface-border bg-white px-2 py-1.5";

export function DeductionEditor({ rows, loading, savingId, error, onAddRow, onUpdate, onSave }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of rows) {
        if (r.id.startsWith("new-") && !next.has(r.id)) {
          next.add(r.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  function isExpanded(id: string) {
    return expandedIds.has(id);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddRow}
          className="rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:border-accent"
        >
          Add deduction
        </button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="rounded-md border border-dashed border-surface-border bg-white px-4 py-3 text-xs text-navy-700/75">
          No deduction rows yet. Add a row here, or say **no deductions** in chat to skip.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-surface-border bg-white">
          <div className="hidden md:block">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted/60 text-navy-700/75">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">Amount</th>
                  <th className="w-40 px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DeductionTableRow
                    key={r.id}
                    row={r}
                    expanded={isExpanded(r.id)}
                    savingId={savingId}
                    onToggleExpand={() => toggleExpanded(r.id)}
                    onUpdate={onUpdate}
                    onSave={onSave}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {rows.map((r) => (
              <DeductionCard
                key={r.id}
                row={r}
                expanded={isExpanded(r.id)}
                savingId={savingId}
                onToggleExpand={() => toggleExpanded(r.id)}
                onUpdate={onUpdate}
                onSave={onSave}
              />
            ))}
          </div>
          <div className="border-t border-surface-border px-3 py-2 text-[11px] text-navy-700/75">
            {loading ? "Loading rows..." : `${rows.length} deduction(s). Say **no deductions** in chat to skip.`}
          </div>
          {error && <div className="px-3 pb-2 text-[11px] text-alertRed">{error}</div>}
        </div>
      )}

      {rows.length === 0 && error && <div className="text-[11px] text-alertRed">{error}</div>}
    </div>
  );
}

function DeductionExtraFields({
  row,
  onUpdate
}: {
  row: DeductionRow;
  onUpdate: Props["onUpdate"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Currency</span>
        <input
          value={row.currency}
          onChange={(e) => onUpdate(row.id, "currency", e.target.value)}
          className={`${fieldClass} uppercase`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Tax period</span>
        <input
          value={row.taxPeriod}
          onChange={(e) => onUpdate(row.id, "taxPeriod", e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Scope</span>
        <select
          value={row.applicationScope}
          onChange={(e) => onUpdate(row.id, "applicationScope", e.target.value)}
          className={fieldClass}
        >
          <option value="annual">Annual</option>
          <option value="monthly">Monthly</option>
          <option value="transaction">Transaction</option>
        </select>
      </label>
    </div>
  );
}

function DeductionTableRow({
  row,
  expanded,
  savingId,
  onToggleExpand,
  onUpdate,
  onSave
}: {
  row: DeductionRow;
  expanded: boolean;
  savingId: string;
  onToggleExpand: () => void;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
}) {
  return (
    <>
      <tr className="border-t border-surface-border">
        <td className="px-3 py-2">
          <input
            value={row.deductionType}
            onChange={(e) => onUpdate(row.id, "deductionType", e.target.value)}
            className={fieldClass}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.amount}
            onChange={(e) => onUpdate(row.id, "amount", e.target.value)}
            className={fieldClass}
          />
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="mr-1 rounded-md border border-surface-border bg-white px-2 py-1 text-navy hover:border-accent"
          >
            {expanded ? "Less" : "Expand"}
          </button>
          <button
            type="button"
            onClick={() => void onSave(row)}
            disabled={savingId === row.id || !row.id.startsWith("new-")}
            className="rounded-md border border-accent/40 bg-accent-light px-2 py-1 text-accent-dark disabled:opacity-50"
          >
            {savingId === row.id ? "Saving..." : row.id.startsWith("new-") ? "Save" : "Saved"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-surface-border bg-surface-muted/40">
          <td colSpan={3} className="px-3 py-3">
            <DeductionExtraFields row={row} onUpdate={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

function DeductionCard({
  row,
  expanded,
  savingId,
  onToggleExpand,
  onUpdate,
  onSave
}: {
  row: DeductionRow;
  expanded: boolean;
  savingId: string;
  onToggleExpand: () => void;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
}) {
  return (
    <div className="space-y-2 rounded-md border border-surface-border p-3 text-xs">
      <input
        value={row.deductionType}
        placeholder="Type"
        onChange={(e) => onUpdate(row.id, "deductionType", e.target.value)}
        className={fieldClass}
      />
      <input
        value={row.amount}
        placeholder="Amount"
        onChange={(e) => onUpdate(row.id, "amount", e.target.value)}
        className={fieldClass}
      />
      {expanded && <DeductionExtraFields row={row} onUpdate={onUpdate} />}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-md border border-surface-border bg-white px-2 py-1 text-navy"
        >
          {expanded ? "Less" : "Expand"}
        </button>
        {row.id.startsWith("new-") && (
          <button
            type="button"
            onClick={() => void onSave(row)}
            disabled={savingId === row.id}
            className="flex-1 rounded-md border border-accent/40 bg-accent-light px-2 py-1 text-accent-dark disabled:opacity-50"
          >
            {savingId === row.id ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
