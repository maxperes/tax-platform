import { formatMoney } from "../../lib/chat-utils";

export type MonthlyCarneLeaoView = {
  taxMonth: string;
  taxableBaseBrl?: number;
  taxComputedBrl?: number;
  creditAppliedBrl?: number;
  netDueBrl?: number;
  dueDate?: string;
  probe?: boolean;
};

export function MonthlyCarneLeaoTable({ rows }: { rows: MonthlyCarneLeaoView[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-navy-700/75">
          <tr>
            <th className="py-1 pr-4 font-medium">Month</th>
            <th className="py-1 pr-4 font-medium">Taxable base</th>
            <th className="py-1 pr-4 font-medium">Tax</th>
            <th className="py-1 pr-4 font-medium">FTC applied</th>
            <th className="py-1 pr-4 font-medium">Net DARF</th>
            <th className="py-1 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.taxMonth} className="border-t border-surface-border">
              <td className="py-2 pr-4 text-navy">{row.taxMonth}</td>
              <td className="py-2 pr-4">{formatMoney(row.taxableBaseBrl ?? 0, "BRL")}</td>
              <td className="py-2 pr-4">{formatMoney(row.taxComputedBrl ?? 0, "BRL")}</td>
              <td className="py-2 pr-4">{formatMoney(row.creditAppliedBrl ?? 0, "BRL")}</td>
              <td className="py-2 pr-4 font-medium text-navy">{formatMoney(row.netDueBrl ?? 0, "BRL")}</td>
              <td className="py-2 text-navy-700/80">{row.dueDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-navy-700/65">
        Sketch from BR-IRPF-EXT-001 after the residency start. Undated recurring income is placed on
        the residency-start month. This is not a DARF or carnê-leão filing.
      </p>
    </div>
  );
}
