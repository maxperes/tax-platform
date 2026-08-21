import { formatMoney } from "../../lib/chat-utils";

export type CrossBorderView = {
  applicable?: boolean;
  usFederal?: {
    grossIncomeUsd?: number;
    netTaxDueUsd?: number;
    taxCreditAppliedUsd?: number;
    filingStatusAssumed?: string;
    note?: string;
  };
  brazil?: {
    taxBrl?: number;
    ftcBrl?: number;
    netPayableBrl?: number;
  };
  notes?: string;
};

export function CrossBorderTable({ comparison }: { comparison: CrossBorderView }) {
  const brazil = comparison.brazil;
  const us = comparison.usFederal;
  if (!brazil && !us) return null;

  const rows: { label: string; us?: string; br?: string }[] = [
    {
      label: us ? "Income / tax computed" : "Brazilian tax computed",
      us: us ? formatMoney(us.grossIncomeUsd ?? 0, "USD") : undefined,
      br: brazil ? formatMoney(brazil.taxBrl ?? 0, "BRL") : undefined
    },
    {
      label: "Foreign tax credit",
      us: us ? formatMoney(us.taxCreditAppliedUsd ?? 0, "USD") : undefined,
      br: brazil ? formatMoney(brazil.ftcBrl ?? 0, "BRL") : undefined
    },
    {
      label: "Net after credit",
      us: us ? formatMoney(us.netTaxDueUsd ?? 0, "USD") : undefined,
      br: brazil ? formatMoney(brazil.netPayableBrl ?? 0, "BRL") : undefined
    }
  ];

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-navy-700/75">
            <tr>
              <th className="py-1 pr-4 font-medium">Line</th>
              {us && <th className="py-1 pr-4 font-medium">United States</th>}
              {brazil && <th className="py-1 font-medium">Brazil</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-surface-border">
                <td className="py-3 pr-4 text-navy-700/80">{row.label}</td>
                {us && <td className="py-3 pr-4 font-medium text-navy">{row.us}</td>}
                {brazil && <td className="py-3 font-medium text-navy">{row.br}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {us?.note && <p className="mt-3 text-xs leading-relaxed text-navy-700/70">{us.note}</p>}
      {comparison.notes && (
        <p className="mt-2 text-xs leading-relaxed text-navy-700/65">{comparison.notes}</p>
      )}
    </div>
  );
}
