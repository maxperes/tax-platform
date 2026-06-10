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
  showEditor: boolean;
  sending: boolean;
  onToggleEditor: () => void;
  onAddRow: () => void;
  onUpdate: (id: string, key: keyof IncomeRow, value: string) => void;
  onSave: (row: IncomeRow) => void;
  onDelete: (row: IncomeRow) => void;
  onQuickAdd: (text: string) => void;
};

export function IncomeEditor({
  rows,
  loading,
  savingId,
  error,
  showEditor,
  sending,
  onToggleEditor,
  onAddRow,
  onUpdate,
  onSave,
  onDelete,
  onQuickAdd
}: Props) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {INCOME_QUICK_ADDS.map((template) => (
          <button
            key={template.label}
            type="button"
            disabled={sending}
            onClick={() => onQuickAdd(template.text)}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:border-emerald-600 disabled:opacity-50"
          >
            {template.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggleEditor}
          className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1 text-xs text-sky-200 hover:border-sky-500"
        >
          {showEditor ? "Hide income table" : "Open income table"}
        </button>
        <button
          type="button"
          onClick={onAddRow}
          className="rounded-full border border-emerald-700 bg-emerald-950 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-500"
        >
          Add row
        </button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
          No income rows yet. Use a quick-add template above, type a line in chat, or add a row in the table.
        </div>
      )}

      {showEditor && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-[980px] w-full text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-2 py-1 text-left">Payer</th>
                  <th className="px-2 py-1 text-left">Country</th>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">Gross</th>
                  <th className="px-2 py-1 text-left">Currency</th>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Period</th>
                  <th className="px-2 py-1 text-left">Nature</th>
                  <th className="px-2 py-1 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <IncomeTableRow
                    key={r.id}
                    row={r}
                    savingId={savingId}
                    onUpdate={onUpdate}
                    onSave={onSave}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <IncomeCard
                key={r.id}
                row={r}
                savingId={savingId}
                onUpdate={onUpdate}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            {loading ? "Loading rows..." : `${rows.length} row(s) in this table.`}
          </div>
          {error && <div className="mt-1 text-[11px] text-rose-300">{error}</div>}
        </div>
      )}
    </div>
  );
}

function IncomeTableRow({
  row,
  savingId,
  onUpdate,
  onSave,
  onDelete
}: {
  row: IncomeRow;
  savingId: string;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
  onDelete: Props["onDelete"];
}) {
  return (
    <tr className="border-t border-slate-800">
      <td className="px-2 py-1">
        <input value={row.payerName} onChange={(e) => onUpdate(row.id, "payerName", e.target.value)} className="w-44 rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </td>
      <td className="px-2 py-1">
        <input value={row.originCountry} onChange={(e) => onUpdate(row.id, "originCountry", e.target.value)} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </td>
      <td className="px-2 py-1">
        <input value={row.incomeType} onChange={(e) => onUpdate(row.id, "incomeType", e.target.value)} className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </td>
      <td className="px-2 py-1">
        <input value={row.grossAmount} onChange={(e) => onUpdate(row.id, "grossAmount", e.target.value)} className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </td>
      <td className="px-2 py-1">
        <input value={row.originalCurrency} onChange={(e) => onUpdate(row.id, "originalCurrency", e.target.value)} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </td>
      <td className="px-2 py-1">
        <input type="date" value={row.paymentDate} onChange={(e) => onUpdate(row.id, "paymentDate", e.target.value)} className="w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      </td>
      <td className="px-2 py-1">
        <select value={row.periodicity} onChange={(e) => onUpdate(row.id, "periodicity", e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          {Object.entries(PERIODICITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <select value={row.nature} onChange={(e) => onUpdate(row.id, "nature", e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1">
          <option value="work">Work</option>
          <option value="investment">Investment</option>
          <option value="retirement">Retirement</option>
          <option value="asset">Asset</option>
          <option value="corporate">Corporate</option>
          <option value="trust">Trust</option>
          <option value="other">Other</option>
        </select>
      </td>
      <td className="px-2 py-1 whitespace-nowrap">
        <button type="button" onClick={() => void onSave(row)} disabled={savingId === row.id} className="mr-2 rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-emerald-200">
          {savingId === row.id ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => void onDelete(row)} disabled={savingId === row.id} className="rounded border border-rose-700 bg-rose-950 px-2 py-1 text-rose-200">
          Delete
        </button>
      </td>
    </tr>
  );
}

function IncomeCard({
  row,
  savingId,
  onUpdate,
  onSave,
  onDelete
}: {
  row: IncomeRow;
  savingId: string;
  onUpdate: Props["onUpdate"];
  onSave: Props["onSave"];
  onDelete: Props["onDelete"];
}) {
  return (
    <div className="rounded-lg border border-slate-800 p-3 space-y-2 text-xs">
      <input value={row.payerName} placeholder="Payer" onChange={(e) => onUpdate(row.id, "payerName", e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      <div className="grid grid-cols-2 gap-2">
        <input value={row.grossAmount} placeholder="Gross" onChange={(e) => onUpdate(row.id, "grossAmount", e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
        <input value={row.originalCurrency} placeholder="Currency" onChange={(e) => onUpdate(row.id, "originalCurrency", e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 uppercase" />
      </div>
      <input type="date" value={row.paymentDate} onChange={(e) => onUpdate(row.id, "paymentDate", e.target.value)} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1" />
      <div className="flex gap-2">
        <button type="button" onClick={() => void onSave(row)} disabled={savingId === row.id} className="flex-1 rounded border border-emerald-700 bg-emerald-950 px-2 py-1 text-emerald-200">
          {savingId === row.id ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => void onDelete(row)} disabled={savingId === row.id} className="rounded border border-rose-700 bg-rose-950 px-2 py-1 text-rose-200">
          Delete
        </button>
      </div>
    </div>
  );
}
