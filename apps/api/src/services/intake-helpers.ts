import type { ConversationState, FiscalProfile } from "@tax-platform/shared";
import { prisma } from "../db.js";
import { syncTaxableEvents, recomputeMonthlyTax } from "./tax-pipeline.js";

export type IntakeGoal = "foreign_salary" | "investments" | "asset_sale" | "full_annual";

export const INTAKE_GOAL_OPTIONS: { id: IntakeGoal; label: string }[] = [
  { id: "foreign_salary", label: "Foreign salary or freelance paid abroad" },
  { id: "investments", label: "Dividends, interest, or investment income" },
  { id: "asset_sale", label: "Asset sale or capital gain" },
  { id: "full_annual", label: "Full annual tax picture" }
];

export type UsFilingInputs = {
  filingStatus: "single" | "mfj" | "hoh";
  foreignEarnedIncomeUsd?: number;
  netInvestmentIncomeUsd?: number;
};

export type IntakeModulePlan = {
  derivedProfile: FiscalProfile | string;
  needsCarnetLeao: boolean;
  needsCapitalGainStep: boolean;
  needsUsAnnual: boolean;
  skipMonthly: boolean;
  intakeGoal?: IntakeGoal;
};

export function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function formatAmount(n: number, currency: string): string {
  const rounded = Math.round(n * 100) / 100;
  const s = Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${s} ${currency}`;
}

export async function loadIntakeModulePlan(
  userId: string,
  taxYear: number,
  context: Record<string, unknown>
): Promise<IntakeModulePlan> {
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const intakeGoal = context.intakeGoal as IntakeGoal | undefined;

  const incomes = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    select: { classification: true, originCountry: true, originalCurrency: true }
  });

  let needsCarnetLeao = false;
  for (const row of incomes) {
    const cls = row.classification as { calculationModule?: string } | null;
    if (cls?.calculationModule === "carnet_leao") {
      needsCarnetLeao = true;
      break;
    }
  }
  if (!needsCarnetLeao && (profile === "resident_brazil" || profile === "non_resident_brazil" || profile === "dual_residence")) {
    needsCarnetLeao = incomes.some((i) => i.originCountry !== "BR" || i.originalCurrency !== "BRL");
  }

  const needsUsAnnual = profile === "resident_usa" || profile === "dual_residence";
  const skipMonthly = profile === "resident_usa" || !needsCarnetLeao;
  const needsCapitalGainStep = intakeGoal !== "foreign_salary" && intakeGoal !== "investments";

  return {
    derivedProfile: profile,
    needsCarnetLeao,
    needsCapitalGainStep,
    needsUsAnnual,
    skipMonthly,
    intakeGoal
  };
}

export function describeModulePlanForUser(plan: IntakeModulePlan): string {
  const lines: string[] = ["**What applies to your profile:**"];
  if (plan.derivedProfile === "dual_residence") {
    lines.push("- **Dual residence** — Brazil Carnê-Leão (foreign income) and US annual estimate both in scope.");
  } else if (plan.derivedProfile === "resident_brazil") {
    lines.push("- **Brazil fiscal resident** — foreign income may trigger monthly Carnê-Leão and annual IRPF-style estimate.");
  } else if (plan.derivedProfile === "resident_usa") {
    lines.push("- **US fiscal resident** — US annual estimate in scope; monthly Carnê-Leão does not apply.");
  } else if (plan.derivedProfile === "non_resident_brazil") {
    lines.push("- **Non-resident Brazil (modeled)** — Carnê-Leão may still apply to foreign income received in Brazil.");
  } else {
    lines.push("- Residency is **undetermined** — we will model Brazil by default until clarified.");
  }
  if (plan.skipMonthly) {
    lines.push("- **Monthly tax review** will be skipped (not applicable for your profile or income mix).");
  } else {
    lines.push("- We will review **month-by-month Carnê-Leão** estimates from your income timeline.");
  }
  if (!plan.needsCapitalGainStep && plan.intakeGoal) {
    lines.push("- **Capital gains** step may be brief unless you had asset sales this year.");
  }
  return lines.join("\n");
}

export function triagePromptText(): string {
  return (
    "Before we collect income, what do you want help with this year?\n\n" +
    INTAKE_GOAL_OPTIONS.map((o) => `- **${o.id}** — ${o.label}`).join("\n") +
    "\n\nReply with one option (e.g. **foreign_salary** or **full_annual**)."
  );
}

export function parseIntakeGoal(text: string): IntakeGoal | undefined {
  const lower = text.trim().toLowerCase().replace(/\s+/g, "_");
  for (const o of INTAKE_GOAL_OPTIONS) {
    if (lower === o.id || lower.includes(o.id.replace(/_/g, " "))) return o.id;
  }
  if (/\b(salary|wage|freelance|pay abroad)\b/i.test(text)) return "foreign_salary";
  if (/\b(dividend|interest|investment|stock)\b/i.test(text)) return "investments";
  if (/\b(sale|capital\s+gain|disposition|asset)\b/i.test(text)) return "asset_sale";
  if (/\b(full|annual|everything|complete)\b/i.test(text)) return "full_annual";
  return undefined;
}

export function isTriagePending(context: Record<string, unknown>): boolean {
  return context._triagePending === true;
}

export function isUsFilingPending(context: Record<string, unknown>, plan: IntakeModulePlan): boolean {
  if (!plan.needsUsAnnual) return false;
  return context._usFilingPending === true && !context.usFilingInputs;
}

export function usFilingPromptText(): string {
  return (
    "For the **US annual estimate**, what is your **filing status**? Reply with one of: **single**, **mfj** (married filing jointly), **hoh** (head of household).\n\n" +
    "Optional on the same line: **FEIE** amount in USD and **net investment income** in USD (e.g. `single, FEIE 0, NII 0`)."
  );
}

export function parseUsFilingInputs(text: string): UsFilingInputs | undefined {
  const lower = text.trim().toLowerCase();
  let filingStatus: UsFilingInputs["filingStatus"] | undefined;
  if (/\b(mfj|married\s+filing\s+jointly)\b/i.test(lower)) filingStatus = "mfj";
  else if (/\b(hoh|head\s+of\s+household)\b/i.test(lower)) filingStatus = "hoh";
  else if (/\bsingle\b/i.test(lower)) filingStatus = "single";
  if (!filingStatus) return undefined;
  const feieMatch = /\bfeie\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(text);
  const niiMatch = /\bnii\s*[:=]?\s*(\d+(?:\.\d+)?)/i.exec(text);
  return {
    filingStatus,
    foreignEarnedIncomeUsd: feieMatch ? Number(feieMatch[1]) : 0,
    netInvestmentIncomeUsd: niiMatch ? Number(niiMatch[1]) : 0
  };
}

export type IncomeGap = {
  incomeId: string;
  payerName: string;
  issue: string;
  suggestion: string;
};

export async function resolveIncomeGaps(userId: string, taxYear: number): Promise<{
  gaps: IncomeGap[];
  hasBlockingGaps: boolean;
  summaryText: string;
}> {
  const rows = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    select: {
      id: true,
      payerName: true,
      originalCurrency: true,
      grossAmountBrl: true,
      exchangeRateToBrl: true,
      taxPaidOriginCountry: true,
      withholdingTax: true,
      nature: true,
      incomeType: true,
      classification: true,
      notes: true
    }
  });

  const gaps: IncomeGap[] = [];
  for (const row of rows) {
    const cls = row.classification as { calculationModule?: string } | null;
    const isCarnet = cls?.calculationModule === "carnet_leao";
    const cur = row.originalCurrency.toUpperCase();
    const isGenericPayer = /^(unknown|employer|payer|income\s+source)$/i.test(row.payerName.trim());
    const isGenericType = /^(income|payment|salary)$/i.test(row.incomeType.trim()) && !row.notes;

    if (isCarnet && cur !== "BRL" && row.grossAmountBrl == null && row.exchangeRateToBrl == null) {
      gaps.push({
        incomeId: row.id,
        payerName: row.payerName,
        issue: "Missing BRL conversion (FX rate or gross amount in BRL)",
        suggestion: `Add exchange rate or BRL equivalent for **${row.payerName}** (${cur}).`
      });
    }
    if (isCarnet && cur !== "BRL" && row.taxPaidOriginCountry == null && row.withholdingTax == null) {
      gaps.push({
        incomeId: row.id,
        payerName: row.payerName,
        issue: "Foreign tax withheld abroad not specified",
        suggestion: `Was tax withheld on **${row.payerName}**? Reply with amount or **none**.`
      });
    }
    if (isGenericPayer) {
      gaps.push({
        incomeId: row.id,
        payerName: row.payerName,
        issue: "Payer name is generic",
        suggestion: "Provide the employer or payer name for this income line."
      });
    }
    if (isGenericType) {
      gaps.push({
        incomeId: row.id,
        payerName: row.payerName,
        issue: "Income type/nature may need clarification",
        suggestion: "Clarify whether this is salary, dividend, rent, RSU, etc."
      });
    }
  }

  const blocking = gaps.filter((g) => g.issue.includes("BRL conversion"));
  let summaryText = "";
  if (gaps.length > 0) {
    summaryText =
      "**Before we continue**, a few income lines need detail:\n" +
      gaps
        .slice(0, 8)
        .map((g) => `- **${g.payerName}**: ${g.issue}. ${g.suggestion}`)
        .join("\n");
    if (gaps.length > 8) summaryText += `\n- _…and ${gaps.length - 8} more item(s)._`;
  }
  return { gaps, hasBlockingGaps: blocking.length > 0, summaryText };
}

export async function prepareEventsStep(userId: string, taxYear: number): Promise<number> {
  return syncTaxableEvents(userId, taxYear);
}

export async function eventsCheckpointMessage(userId: string, taxYear: number): Promise<string> {
  await prepareEventsStep(userId, taxYear);
  const rows = await prisma.taxableEvent.findMany({
    where: { userId, taxYear },
    orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      description: true,
      eventType: true,
      isTaxable: true,
      requiresReview: true,
      occurredOn: true,
      amountOriginal: true,
      currency: true
    }
  });

  const cta =
    "These events are **derived from your income rows** (not typed separately). Say **looks correct** or **yes** to continue to capital gains, or **go back to income** to fix sources.\n\n" +
    "_If something is wrong, update the income line — events will refresh on this step._";

  if (rows.length === 0) {
    return (
      "**Review derived taxable events**\n\n" +
      `No events were derived yet — add at least one income line first, or say **that's all** on the income step.\n\n${cta}`
    );
  }

  const header = `**Derived taxable events (${rows.length})** — confirm this classification.\n\n`;
  const table =
    `| # | Type | Taxable | Review | Amount | Date | Description |\n|---|------|---------|--------|--------|------|-------------|\n` +
    rows
      .map((r, i) => {
        const amt = r.amountOriginal != null ? `${r.amountOriginal.toNumber()} ${r.currency ?? ""}` : "—";
        const date = r.occurredOn.toISOString().slice(0, 10);
        return `| ${i + 1} | ${r.eventType} | ${r.isTaxable ? "yes" : "no"} | ${r.requiresReview ? "yes" : "no"} | ${amt} | ${date} | ${escapeTableCell(r.description)} |`;
      })
      .join("\n");

  return `${header}${table}\n\n${cta}`;
}

export async function prepareMonthlyCalcStep(userId: string, taxYear: number): Promise<void> {
  await recomputeMonthlyTax(userId, taxYear);
}

export async function formatMonthlyTaxForRecap(userId: string, taxYear: number): Promise<string> {
  await prepareMonthlyCalcStep(userId, taxYear);
  const rows = await prisma.monthlyTaxCalculation.findMany({
    where: { userId, taxYear },
    orderBy: { taxMonth: "asc" }
  });

  const cta =
    "Review month-by-month **Carnê-Leão** totals. Say **looks correct** or **yes** to move to the report step, or describe what to fix in income.\n\n" +
    "_Amounts are engine estimates — not filing instructions._";

  if (rows.length === 0) {
    return (
      "**Monthly Carnê-Leão review**\n\n" +
      "No monthly snapshots apply (no foreign-income Carnê-Leão lines, or US-only profile). Say **next step** to continue to the report.\n\n" +
      cta
    );
  }

  let ytdDue = 0;
  let preliminaryMonths = 0;
  const header = `**Monthly Carnê-Leão (${rows.length} month(s))**\n\n`;
  const table =
    `| Month | Taxable base (BRL) | Rate | Gross tax | Net due | Status |\n|-------|-------------------|------|-----------|---------|--------|\n` +
    rows
      .map((r) => {
        const due = r.netTaxDue.toNumber();
        ytdDue += due;
        if (r.calculationStatus === "preliminary" || r.requiresAdditionalReview) preliminaryMonths += 1;
        return `| ${r.taxMonth} | ${formatAmount(r.taxableBase.toNumber(), "BRL")} | ${(r.appliedTaxRate.toNumber() * 100).toFixed(1)}% | ${formatAmount(r.grossTax.toNumber(), "BRL")} | ${formatAmount(due, "BRL")} | ${r.calculationStatus}${r.requiresAdditionalReview ? " ⚠" : ""} |`;
      })
      .join("\n");

  const ytdLine = `\n**YTD net due (summed months):** ${formatAmount(ytdDue, "BRL")}`;
  const warn =
    preliminaryMonths > 0
      ? `\n**Note:** ${preliminaryMonths} month(s) flagged **preliminary** (often missing FX on income lines).`
      : "";

  return `${header}${table}${ytdLine}${warn}\n\n${cta}`;
}

export function isEventsConfirmIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /^(yes|yep|yeah|ok|okay|correct|confirmed)\b/i.test(lower) ||
    /\b(looks?\s+(good|correct|right|fine)|that['']?s\s+(correct|right|fine))\b/i.test(lower) ||
    /^next(\s+step)?\b/i.test(lower) ||
    /\b(confirm|proceed|continue)\b/i.test(lower)
  );
}

export function isMonthlyCalcConfirmIntent(userContent: string): boolean {
  return isEventsConfirmIntent(userContent);
}

export function isCapitalGainSkipIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /^no\s+(capital\s+)?gains?\b/i.test(lower) ||
    /^none\b/i.test(lower) ||
    /\bno\s+asset\s+sales?\b/i.test(lower) ||
    /\bnothing\s+to\s+report\b/i.test(lower) ||
    /\b(skip|no)\s+capital\b/i.test(lower) ||
    /\bdidn['']?t\s+sell\b/i.test(lower)
  );
}

function shouldSkipCapitalGainStep(plan: IntakeModulePlan): boolean {
  return plan.intakeGoal === "foreign_salary" || plan.intakeGoal === "investments";
}

export function nextStateAfterEvents(plan: IntakeModulePlan): ConversationState {
  if (shouldSkipCapitalGainStep(plan)) return "deductions";
  return "capital_gain";
}

export function nextStateAfterCapitalGain(_plan: IntakeModulePlan): ConversationState {
  return "deductions";
}

export function nextStateAfterDeductions(plan: IntakeModulePlan): ConversationState {
  return plan.skipMonthly ? "report" : "monthly_calc";
}

/** Adjust LLM/deterministic advance targets based on profile and intake goal. */
export function applyProfileAwareAdvance(
  current: ConversationState,
  next: ConversationState,
  plan: IntakeModulePlan
): ConversationState {
  if (next === "monthly_calc" && plan.skipMonthly) return "report";
  if (current === "events" && next === "capital_gain" && shouldSkipCapitalGainStep(plan)) {
    return "deductions";
  }
  if (current === "events" && next === "deductions" && !shouldSkipCapitalGainStep(plan)) {
    return "capital_gain";
  }
  if (current === "capital_gain" && next === "monthly_calc") return "deductions";
  if (current === "capital_gain" && next === "report" && !plan.skipMonthly) return "deductions";
  return next;
}

export async function formatMissingDataChecklist(userId: string, taxYear: number): Promise<string> {
  const { gaps } = await resolveIncomeGaps(userId, taxYear);
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const items: string[] = [];
  if (fp?.requiresAdditionalReview) {
    items.push("Fiscal profile flagged for **expert review** (complex residence or trust-like factors).");
  }
  if (gaps.length > 0) {
    items.push(...gaps.slice(0, 5).map((g) => `${g.payerName}: ${g.issue}`));
    if (gaps.length > 5) items.push(`…and ${gaps.length - 5} more income gap(s).`);
  }
  const monthly = await prisma.monthlyTaxCalculation.findMany({
    where: { userId, taxYear, requiresAdditionalReview: true },
    select: { taxMonth: true }
  });
  if (monthly.length > 0) {
    items.push(`Monthly tax: ${monthly.length} month(s) preliminary (${monthly.map((m) => m.taxMonth).join(", ")}).`);
  }
  if (items.length === 0) return "";
  return "\n**Missing data / review checklist**\n" + items.map((i) => `- ${i}`).join("\n") + "\n";
}

export async function formatCapitalGainsBlockForRecap(userId: string, taxYear: number): Promise<string> {
  const rows = await prisma.capitalGainCalculation.findMany({
    where: { userId, taxYear },
    orderBy: { saleDate: "desc" },
    take: 10
  });
  if (rows.length === 0) return "";
  const lines = rows.map((r) => {
    const gain = r.gainAmount?.toNumber() ?? 0;
    const tax = r.taxEstimate?.toNumber() ?? 0;
    const jur = r.jurisdiction ?? "?";
    return `- **${r.assetType}** (${jur}): gain **${formatAmount(gain, r.saleCurrency)}** · est. tax **${formatAmount(tax, r.saleCurrency)}** · sold ${r.saleDate.toISOString().slice(0, 10)}`;
  });
  return `\n**Capital gains (${rows.length})**\n${lines.join("\n")}\n`;
}

export async function formatMonthlySummaryBlockForRecap(userId: string, taxYear: number): Promise<string> {
  const rows = await prisma.monthlyTaxCalculation.findMany({
    where: { userId, taxYear },
    orderBy: { taxMonth: "asc" }
  });
  if (rows.length === 0) return "";
  const ytd = rows.reduce((s, r) => s + r.netTaxDue.toNumber(), 0);
  const prelim = rows.filter((r) => r.requiresAdditionalReview || r.calculationStatus === "preliminary").length;
  let block =
    `\n**Monthly Carnê-Leão summary**\n` +
    `- Months on file: **${rows.length}**\n` +
    `- **YTD net due (summed):** ${formatAmount(ytd, "BRL")}\n`;
  if (prelim > 0) block += `- **${prelim}** month(s) marked preliminary.\n`;
  return block;
}

export function specialistHandoffBlock(requiresReview: boolean, gapsSummary: string): string {
  if (!requiresReview && !gapsSummary) return "";
  let block = "\n**Specialist handoff**\n";
  if (requiresReview) {
    block +=
      "This case is flagged for **additional expert review**. Results are orientation only until reviewed.\n";
  }
  if (gapsSummary) {
    block += gapsSummary + "\n";
  }
  block +=
    "Reply **proceed anyway** to generate a preliminary report, or fix items above first.\n";
  return block;
}

export function isProceedAnywayIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  return (
    /\bproceed\s+anyway\b/i.test(lower) ||
    /\b(preliminary|draft)\s+report\b/i.test(lower) ||
    /\bi\s+understand\b.*\b(review|preliminary)\b/i.test(lower)
  );
}

export function nextActionsBlock(): string {
  return (
    "\n**Next actions**\n" +
    "- Say **go back to income** (or deductions / events) to fix earlier answers.\n" +
    "- Say **regenerate the report** after any change.\n" +
    "- Use **Download latest report (JSON)** in the app for the full export.\n"
  );
}
