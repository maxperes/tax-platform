import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, downloadAuthenticated } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { formatCalcStatus } from "../lib/chat-constants";
import { formatMoney } from "../lib/chat-utils";
import { fetchTaxReport, taxReportQueryKey, type FullTaxReport } from "../lib/tax-report";

export type { FullTaxReport };
export { fetchTaxReport, taxReportQueryKey };

export function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();

  const { data: report, isPending, isError, isFetching } = useQuery({
    queryKey: taxReportQueryKey(reportId ?? ""),
    queryFn: () => fetchTaxReport(reportId!),
    enabled: Boolean(reportId),
    staleTime: 60_000
  });

  const { data: rulesFreshness } = useQuery({
    queryKey: ["rulesFreshness", report?.taxYear],
    queryFn: async () =>
      api<{ isRulesOutdated: boolean; currentRuleVersion: string }>(
        `/api/tax-rules/freshness?taxYear=${report!.taxYear}`
      ),
    enabled: Boolean(report?.taxYear)
  });

  if (!report) {
    if (isPending || isFetching) return <LoadingShell message="Loading report…" />;
    if (isError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="text-alertRed">Report not found.</p>
            <Link to="/sessions" className="text-accent-dark hover:underline">
              Back to sessions
            </Link>
          </div>
        </div>
      );
    }
    return <LoadingShell message="Loading report…" />;
  }

  const summary = report.summaryJson;

  return (
    <div className="min-h-screen p-6 print:p-0">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/sessions" className="text-sm text-accent-dark hover:underline">
            Back to sessions
          </Link>
          <button
            type="button"
            onClick={() => void downloadAuthenticated(`/api/report/${report.id}/download.html`, `tax-report-${report.taxYear}.html`)}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
          >
            Download HTML
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm hover:border-accent"
          >
            Print
          </button>
        </div>

        <header className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
          <p className="eyebrow">Filing report</p>
          <h1 className="mt-2 font-display text-3xl text-navy">{report.title}</h1>
          <p className="text-sm text-navy-700/75 mt-1">
            Tax year {report.taxYear} · Generated {new Date(report.createdAt).toLocaleString()}
          </p>
          {report.isStale && (
            <p className="mt-3 text-sm text-warn rounded-lg border border-warn/30 bg-warn-light px-3 py-2">
              This report may be stale — underlying data changed after generation. Regenerate from chat.
            </p>
          )}
          {rulesFreshness?.isRulesOutdated && (
            <p className="mt-3 text-sm text-warn rounded-lg border border-warn/30 bg-warn-light px-3 py-2">
              Tax rules changed since this report was generated ({report.ruleVersion ?? "unknown stamp"} →{" "}
              {rulesFreshness.currentRuleVersion}). Regenerate from chat to refresh calculations.
            </p>
          )}
          {report.requiresAdditionalReview && (
            <p className="mt-3 text-sm text-warn rounded-lg border border-warn/30 bg-warn-light px-3 py-2">
              Flagged for additional expert review — figures are preliminary orientation only.
            </p>
          )}
          {summary.fiscalProfile && (
            <p className="mt-3 text-sm text-navy-700">Fiscal profile: {summary.fiscalProfile}</p>
          )}
        </header>

        {summary.annualTaxEstimates && summary.annualTaxEstimates.length > 0 && (
          <section className="rounded-xl border border-surface-border bg-surface-muted p-4">
            <h2 className="text-lg font-medium mb-3">Annual estimates</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-navy-700/75 text-left">
                  <tr>
                    <th className="pr-4 py-1">Jurisdiction</th>
                    <th className="pr-4 py-1">Gross income</th>
                    <th className="pr-4 py-1">Net tax due</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.annualTaxEstimates.map((est, i) => (
                    <tr key={i} className="border-t border-surface-border">
                      <td className="pr-4 py-2">{est.jurisdiction}</td>
                      <td className="pr-4 py-2">
                        {Number(est.grossIncome) === 0 && (summary.unconvertedIncome?.length ?? 0) > 0
                          ? "—"
                          : formatMoney(est.grossIncome, est.currency)}
                      </td>
                      <td className="pr-4 py-2 font-medium">{formatMoney(est.netTaxDue, est.currency)}</td>
                      <td className="py-2">{formatCalcStatus(est.calculationStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary.unconvertedIncome && summary.unconvertedIncome.length > 0 && (
              <p className="mt-3 text-sm text-navy-700/70">
                Not converted yet:{" "}
                {summary.unconvertedIncome
                  .map((line) => `${formatMoney(line.amount, line.currency)} (${line.payerName ?? "income"})`)
                  .join("; ")}
                . Reply in chat with a rate like <span className="font-medium">1.55 BRL per PEN</span>, then
                regenerate the report.
              </p>
            )}
            {summary.annualTaxEstimates.some(
              (est) => est.calculationStatus === "preliminary" || est.requiresAdditionalReview
            ) && (
              <p className="mt-3 text-sm text-navy-700/70">
                Preliminary: unconverted amounts are excluded from the tax base until an exchange rate is
                provided. Dual residence is always flagged for specialist review.
              </p>
            )}
          </section>
        )}

        {summary.monthlyCarnetLeao && summary.monthlyCarnetLeao.length > 0 && (
          <section className="rounded-xl border border-surface-border bg-surface-muted p-4">
            <h2 className="text-lg font-medium mb-3">Monthly Carnê-Leão</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-navy-700/75 text-left">
                  <tr>
                    <th className="pr-4 py-1">Month</th>
                    <th className="pr-4 py-1">Taxable base (BRL)</th>
                    <th className="pr-4 py-1">Net due</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.monthlyCarnetLeao.map((m, i) => (
                    <tr key={i} className="border-t border-surface-border">
                      <td className="pr-4 py-2">{m.taxMonth}</td>
                      <td className="pr-4 py-2">{formatMoney(m.taxableBase, "BRL")}</td>
                      <td className="pr-4 py-2">{formatMoney(m.netTaxDue, "BRL")}</td>
                      <td className="py-2">{formatCalcStatus(m.calculationStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {summary.capitalGains && summary.capitalGains.length > 0 && (
          <section className="rounded-xl border border-surface-border bg-surface-muted p-4">
            <h2 className="text-lg font-medium mb-3">Capital gains</h2>
            <ul className="space-y-2 text-sm">
              {summary.capitalGains.map((cg, i) => (
                <li key={i}>
                  {cg.assetType}: gain {formatMoney(cg.gainAmount)} · estimated tax {formatMoney(cg.taxEstimate)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {report.sections && report.sections.length > 0 && (
          <section className="rounded-xl border border-surface-border bg-surface-muted p-4 space-y-4">
            <h2 className="text-lg font-medium">Report sections</h2>
            {report.sections.map((sec, i) => (
              <div key={i} className="border-t border-surface-border pt-3 first:border-0 first:pt-0">
                <h3 className="font-medium text-navy">{sec.title}</h3>
                {sec.bodyMarkdown && <p className="text-sm text-navy-700/75 mt-1">{sec.bodyMarkdown}</p>}
                {sec.items && sec.items.length > 0 && (
                  <ul className="mt-2 text-sm space-y-1">
                    {sec.items.map((it, j) => (
                      <li key={j}>
                        <span className="text-navy-700/75">{it.label}:</span>{" "}
                        {typeof it.valueJson === "object" ? JSON.stringify(it.valueJson) : String(it.valueJson)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {summary.estimatesDisclaimer && (
          <p className="text-sm text-navy-700/60 italic">{summary.estimatesDisclaimer}</p>
        )}
      </div>
    </div>
  );
}
