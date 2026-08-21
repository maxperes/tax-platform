import { formatMoney } from "../../lib/chat-utils";
import {
  scenarioTaxAndDelta,
  type PlanningScenarioView
} from "../../lib/impact-assessment-view";

function formatDelta(delta: number, currency: string): string {
  if (delta === 0) return formatMoney(0, currency);
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(delta), currency)}`;
}

export function ScenarioCompareTable({
  scenarios,
  baselineTax,
  currency = "BRL",
  proUnlocked
}: {
  scenarios: PlanningScenarioView[];
  baselineTax: number;
  currency?: string;
  proUnlocked?: boolean;
}) {
  if (scenarios.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-navy-700/75">
          <tr>
            <th className="py-1 pr-4 font-medium">Scenario</th>
            <th className="py-1 pr-4 font-medium">Estimated BR tax</th>
            <th className="py-1 font-medium">vs this hypothesis</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => {
            const { tax, delta } = scenarioTaxAndDelta(scenario, baselineTax);
            return (
              <tr key={scenario.id} className="border-t border-surface-border align-top">
                <td className="py-3 pr-4">
                  <p className="font-medium text-navy">{scenario.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-navy-700/70">{scenario.description}</p>
                </td>
                <td className="py-3 pr-4 font-medium text-navy">{formatMoney(tax, currency)}</td>
                <td className="py-3 text-navy">{formatDelta(delta, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-navy-700/65">
        Baseline for this run: {formatMoney(baselineTax, currency)}. Origin-country tax on a sale is not
        modeled.
        {proUnlocked === false ? " Scenario figures are orientation; full planning is a Pro feature." : ""}
      </p>
    </div>
  );
}
