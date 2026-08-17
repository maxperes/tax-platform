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
  showEditor: boolean;
  onToggleEditor: () => void;
  onAddRow: () => void;
  onUpdate: (id: string, key: keyof DeductionRow, value: string) => void;
  onSave: (row: DeductionRow) => void;
};

export function DeductionEditor({
  rows,
  loading,
  savingId,
  error,
  showEditor,
  onToggleEditor,
  onAddRow,
  onUpdate,
  onSave
}: Props) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleEditor}
          className="rounded-full border border-accent bg-accent-light px-3 py-1 text-xs text-accent-dark hover:border-accent"
        >
          {showEditor ? "Hide deductions table" : "Open deductions table"}
        </button>
        <button
          type="button"
          onClick={onAddRow}
          className="rounded-full border border-accent bg-accent-light px-3 py-1 text-xs text-accent-dark hover:border-accent"
        >
          Add deduction
        </button>
      </div>
      {showEditor && (
        <div className="rounded-lg border border-surface-border bg-surface-muted p-2">
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-[720px] w-full text-xs">
              <thead className="text-navy-700/75">
                <tr>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">Amount</th>
                  <th className="px-2 py-1 text-left">Currency</th>
                  <th className="px-2 py-1 text-left">Tax period</th>
                  <th className="px-2 py-1 text-left">Scope</th>
                  <th className="px-2 py-1 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-surface-border">
                    <td className="px-2 py-1">
                      <input value={r.deductionType} onChange={(e) => onUpdate(r.id, "deductionType", e.target.value)} className="w-28 rounded border border-surface-border bg-white px-2 py-1" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.amount} onChange={(e) => onUpdate(r.id, "amount", e.target.value)} className="w-24 rounded border border-surface-border bg-white px-2 py-1" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.currency} onChange={(e) => onUpdate(r.id, "currency", e.target.value)} className="w-16 rounded border border-surface-border bg-white px-2 py-1 uppercase" />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.taxPeriod} onChange={(e) => onUpdate(r.id, "taxPeriod", e.target.value)} className="w-20 rounded border border-surface-border bg-white px-2 py-1" />
                    </td>
                    <td className="px-2 py-1">
                      <select value={r.applicationScope} onChange={(e) => onUpdate(r.id, "applicationScope", e.target.value)} className="rounded border border-surface-border bg-white px-2 py-1">
                        <option value="annual">Annual</option>
                        <option value="monthly">Monthly</option>
                        <option value="transaction">Transaction</option>
                      </select>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <button type="button" onClick={() => void onSave(r)} disabled={savingId === r.id || !r.id.startsWith("new-")} className="rounded border border-accent bg-accent-light px-2 py-1 text-accent-dark disabled:opacity-50">
                        {savingId === r.id ? "Saving..." : r.id.startsWith("new-") ? "Save" : "Saved"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-surface-border p-3 space-y-2 text-xs">
                <input value={r.deductionType} placeholder="Type" onChange={(e) => onUpdate(r.id, "deductionType", e.target.value)} className="w-full rounded border border-surface-border bg-white px-2 py-1" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={r.amount} placeholder="Amount" onChange={(e) => onUpdate(r.id, "amount", e.target.value)} className="rounded border border-surface-border bg-white px-2 py-1" />
                  <input value={r.currency} placeholder="Currency" onChange={(e) => onUpdate(r.id, "currency", e.target.value)} className="rounded border border-surface-border bg-white px-2 py-1 uppercase" />
                </div>
                {r.id.startsWith("new-") && (
                  <button type="button" onClick={() => void onSave(r)} disabled={savingId === r.id} className="w-full rounded border border-accent bg-accent-light px-2 py-1 text-accent-dark">
                    {savingId === r.id ? "Saving..." : "Save"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-navy-700/75">
            {loading ? "Loading rows..." : `${rows.length} deduction(s). Say **no deductions** in chat to skip.`}
          </div>
          {error && <div className="mt-1 text-[11px] text-alertRed">{error}</div>}
        </div>
      )}
    </div>
  );
}
