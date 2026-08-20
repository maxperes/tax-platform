import { useEffect, useState } from "react";
import { INCOME_QUICK_ADDS, PERIODICITY_LABELS } from "../../lib/chat-constants";

export type IncomeRow = {
  id: string;
  taxYear: number;
  payerName: string;
  originCountry: string;
  incomeType: string;
  grossAmount: string;
  originalCurrency: string;
  paymentDate: string;
  periodicity: "monthly" | "annual" | "one_off" | "recurring";
  nature: "work" | "investment" | "retirement" | "asset" | "corporate" | "trust" | "other";
};

type Props = {
  rows: IncomeRow[];
  loading: boolean;
  savingId: string;
  error: string;
  sending: boolean;
  onAddRow: () => void;
  onUpdate: (id: string, key: keyof IncomeRow, value: string) => void;
  onSave: (row: IncomeRow) => void;
  onDelete: (row: IncomeRow) => void;
  onQuickAdd: (text: string) => void;
};

const fieldClass = "w-full min-w-0 rounded-md border border-surface-border bg-white px-2 py-1.5";

export function IncomeEditor({
  rows,
  loading,
  savingId,
  error,
  sending,
  onAddRow,
  onUpdate,
  onSave,
  onDelete,
  onQuickAdd
}: Props) {
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
        {INCOME_QUICK_ADDS.map((template) => (
          <button
            key={template.label}
            type="button"
            disabled={sending}
            onClick={() => onQuickAdd(template.text)}
            className="rounded-md border border-surface-border bg-white px-3 py-1.5 text-xs font-medium text-navy hover:border-accent disabled:opacity-50"
          >
            {template.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onAddRow}
          className="rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:border-accent"
        >
          Add row
        </button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="rounded-md border border-dashed border-surface-border bg-white px-4 py-3 text-xs text-navy-700/75">
          No income rows yet. Use a quick-add template, type a line in chat, or add a row.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-surface-border bg-white">
          <div className="hidden md:block">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted/60 text-navy-700/75">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Payer</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">Amount</th>
                  <th className="w-36 px-3 py-2 text-left font-medium">Date</th>
                  <th className="w-40 px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <IncomeTableRow
                    key={r.id}
                    row={r}
                    expanded={isExpanded(r.id)}
                    savingId={savingId}
                    onToggleExpand={() => toggleExpanded(r.id)}
                    onUpdate={onUpdate}
                    onSave={onSave}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {rows.map((r) => (
              <IncomeCard
                key={r.id}
                row={r}
                expanded={isExpanded(r.id)}
                savingId={savingId}
                onToggleExpand={() => toggleExpanded(r.id)}
                onUpdate={onUpdate}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </div>
          <div className="border-t border-surface-border px-3 py-2 text-[11px] text-navy-700/75">
            {loading ? "Loading rows..." : `${rows.length} row(s) in this table.`}
          </div>
          {error && <div className="px-3 pb-2 text-[11px] text-alertRed">{error}</div>}
        </div>
      )}

      {rows.length === 0 && error && <div className="text-[11px] text-alertRed">{error}</div>}
    </div>
  );
}

function IncomeExtraFields({
  row,
  onUpdate,
  onSave
}: {
  row: IncomeRow;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Country</span>
        <input
          value={row.originCountry}
          onChange={(e) => onUpdate(row.id, "originCountry", e.target.value)}
          className={`${fieldClass} uppercase`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Type</span>
        <input
          value={row.incomeType}
          onChange={(e) => onUpdate(row.id, "incomeType", e.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Currency</span>
        <input
          value={row.originalCurrency}
          onChange={(e) => onUpdate(row.id, "originalCurrency", e.target.value)}
          onBlur={(e) => void onSave({ ...row, originalCurrency: e.target.value })}
          className={`${fieldClass} uppercase`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Period</span>
        <select
          value={row.periodicity}
          onChange={(e) => onUpdate(row.id, "periodicity", e.target.value)}
          className={fieldClass}
        >
          {Object.entries(PERIODICITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] text-navy-700/70">Nature</span>
        <select value={row.nature} onChange={(e) => onUpdate(row.id, "nature", e.target.value)} className={fieldClass}>
          <option value="work">Work</option>
          <option value="investment">Investment</option>
          <option value="retirement">Retirement</option>
          <option value="asset">Asset</option>
          <option value="corporate">Corporate</option>
          <option value="trust">Trust</option>
          <option value="other">Other</option>
        </select>
      </label>
    </div>
  );
}

function IncomeTableRow({
  row,
  expanded,
  savingId,
  onToggleExpand,
  onUpdate,
  onSave,
  onDelete
}: {
  row: IncomeRow;
  expanded: boolean;
  savingId: string;
  onToggleExpand: () => void;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
  onDelete: Props["onDelete"];
}) {
  return (
    <>
      <tr className="border-t border-surface-border">
        <td className="px-3 py-2">
          <input
            value={row.payerName}
            onChange={(e) => onUpdate(row.id, "payerName", e.target.value)}
            className={fieldClass}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={row.grossAmount}
            onChange={(e) => onUpdate(row.id, "grossAmount", e.target.value)}
            className={fieldClass}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="date"
            value={row.paymentDate}
            onChange={(e) => onUpdate(row.id, "paymentDate", e.target.value)}
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
            disabled={savingId === row.id}
            className="mr-1 rounded-md border border-accent/40 bg-accent-light px-2 py-1 text-accent-dark disabled:opacity-50"
          >
            {savingId === row.id ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void onDelete(row)}
            disabled={savingId === row.id}
            className="rounded-md border border-alertRed/30 bg-white px-2 py-1 text-alertRed disabled:opacity-50"
          >
            Delete
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-surface-border bg-surface-muted/40">
          <td colSpan={4} className="px-3 py-3">
            <IncomeExtraFields row={row} onUpdate={onUpdate} onSave={onSave} />
          </td>
        </tr>
      )}
    </>
  );
}

function IncomeCard({
  row,
  expanded,
  savingId,
  onToggleExpand,
  onUpdate,
  onSave,
  onDelete
}: {
  row: IncomeRow;
  expanded: boolean;
  savingId: string;
  onToggleExpand: () => void;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
  onDelete: Props["onDelete"];
}) {
  return (
    <div className="space-y-2 rounded-md border border-surface-border p-3 text-xs">
      <input
        value={row.payerName}
        placeholder="Payer"
        onChange={(e) => onUpdate(row.id, "payerName", e.target.value)}
        className={fieldClass}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={row.grossAmount}
          placeholder="Amount"
          onChange={(e) => onUpdate(row.id, "grossAmount", e.target.value)}
          className={fieldClass}
        />
        <input
          type="date"
          value={row.paymentDate}
          onChange={(e) => onUpdate(row.id, "paymentDate", e.target.value)}
          className={fieldClass}
        />
      </div>
      {expanded && <IncomeExtraFields row={row} onUpdate={onUpdate} onSave={onSave} />}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="rounded-md border border-surface-border bg-white px-2 py-1 text-navy"
        >
          {expanded ? "Less" : "Expand"}
        </button>
        <button
          type="button"
          onClick={() => void onSave(row)}
          disabled={savingId === row.id}
          className="flex-1 rounded-md border border-accent/40 bg-accent-light px-2 py-1 text-accent-dark disabled:opacity-50"
        >
          {savingId === row.id ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void onDelete(row)}
          disabled={savingId === row.id}
          className="rounded-md border border-alertRed/30 bg-white px-2 py-1 text-alertRed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
