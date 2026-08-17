import type { ConversationState, FiscalProfile } from "@tax-platform/shared";
import {
  classifyIncome,
  includesInOrdinaryAnnual,
  includesInUsOrdinaryAnnual,
  jurisdictionsForProfile,
  resolveBrlFromIncome,
  resolveUsdFromIncome
} from "@tax-platform/rules";
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

const US_FILING_STATUS_LABELS: Record<UsFilingInputs["filingStatus"], string> = {
  single: "single",
  mfj: "married filing jointly",
  hoh: "head of household"
};

export function usFilingStatusLabel(status: UsFilingInputs["filingStatus"]): string {
  return US_FILING_STATUS_LABELS[status];
}

function maritalStatusOf(context?: Record<string, unknown>): string | undefined {
  if (!context) return undefined;
  const nested = context.fiscalResidence;
  const fromNested =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>).maritalStatus
      : undefined;
  const raw = context.maritalStatus ?? fromNested;
  return typeof raw === "string" && raw.trim() && raw !== "not_sure" ? raw.trim() : undefined;
}

/** When marital status already implies a US filing status, skip the extra question. */
export function inferredUsFilingStatus(
  context?: Record<string, unknown>
): UsFilingInputs["filingStatus"] | undefined {
  const marital = maritalStatusOf(context);
  if (marital === "single" || marital === "divorced" || marital === "widowed") return "single";
  return undefined;
}

export function defaultUsFilingInputs(status: UsFilingInputs["filingStatus"]): UsFilingInputs {
  return { filingStatus: status, foreignEarnedIncomeUsd: 0, netInvestmentIncomeUsd: 0 };
}

function isMarriedForUsFiling(context?: Record<string, unknown>): boolean {
  const marital = maritalStatusOf(context);
  return marital === "married" || marital === "stable_union";
}

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
  const lines: string[] = [
    "**What applies to your profile:**",
    "- After residency and income (and a short asset screen), you can open the **360° tax map** — the same view as the interview."
  ];
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
    "Every path builds the same **360° tax map**. What should we focus on first this year?\n\n" +
    INTAKE_GOAL_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join("\n") +
    "\n\nReply with **1**, **2**, **3**, or **4**."
  );
}

export function parseIntakeGoal(text: string): IntakeGoal | undefined {
  const trimmed = text.trim();
  const numbered = trimmed.match(/^(?:option\s+)?([1-4])(?:[.)](?:\s|$)|$)/i);
  if (numbered) {
    return INTAKE_GOAL_OPTIONS[Number(numbered[1]) - 1]!.id;
  }
  const lower = trimmed.toLowerCase().replace(/\s+/g, "_");
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

export function usFilingPromptText(context?: Record<string, unknown>): string {
  if (isMarriedForUsFiling(context)) {
    return (
      "For a **US return**, will you file **jointly with your spouse**?\n\n" +
      "Reply **yes**, **no**, or **not sure**."
    );
  }
  return (
    "For a **US return**, how do you usually file?\n\n" +
    "1. Single\n" +
    "2. Married, jointly with my spouse\n" +
    "3. Head of household\n" +
    "4. Not sure\n\n" +
    "Reply with **1–4**."
  );
}

function parseUsdAmountAfterLabel(text: string, label: "feie" | "nii"): number | undefined {
  const re = new RegExp(`\\b${label}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)\\s*(k\\b)?`, "i");
  const match = re.exec(text);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  return match[2] ? n * 1000 : n;
}

export function parseUsFilingInputs(
  text: string,
  context?: Record<string, unknown>
): UsFilingInputs | undefined {
  const lower = text.trim().toLowerCase();
  const amounts = {
    foreignEarnedIncomeUsd: parseUsdAmountAfterLabel(text, "feie") ?? 0,
    netInvestmentIncomeUsd: parseUsdAmountAfterLabel(text, "nii") ?? 0
  };
  const withStatus = (filingStatus: UsFilingInputs["filingStatus"]): UsFilingInputs => ({
    filingStatus,
    ...amounts
  });

  if (/^(not[_\s-]?sure|unsure|unknown|idk)$/i.test(lower)) return withStatus("single");

  if (isMarriedForUsFiling(context)) {
    if (/^(yes|y|true|sim)\b/i.test(lower) || /\bjoint(ly)?\b/i.test(lower)) return withStatus("mfj");
    if (/^(no|n|false|nao|não)\b/i.test(lower) || /\bseparat/i.test(lower)) return withStatus("single");
  }

  let filingStatus: UsFilingInputs["filingStatus"] | undefined;
  if (/\b(mfj|married(\s+filing\s+jointly)?|joint)\b/i.test(lower)) filingStatus = "mfj";
  else if (/\b(hoh|head\s+of\s+household)\b/i.test(lower)) filingStatus = "hoh";
  else if (/\bsingle\b/i.test(lower)) filingStatus = "single";
  else {
    const numbered = /^(?:option\s+)?([1-4])[.)]?$/i.exec(lower.trim());
    if (numbered?.[1] === "1") filingStatus = "single";
    else if (numbered?.[1] === "2") filingStatus = "mfj";
    else if (numbered?.[1] === "3") filingStatus = "hoh";
    else if (numbered?.[1] === "4") filingStatus = "single";
  }
  if (!filingStatus) return undefined;
  return withStatus(filingStatus);
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
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurs = jurisdictionsForProfile(profile);
  const rows = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    select: {
      id: true,
      payerName: true,
      originCountry: true,
      originalCurrency: true,
      grossAmount: true,
      grossAmountBrl: true,
      exchangeRateToBrl: true,
      taxPaidOriginCountry: true,
      withholdingTax: true,
      nature: true,
      incomeType: true,
      periodicity: true,
      paymentDate: true,
      notes: true
    }
  });

  const gaps: IncomeGap[] = [];
  for (const row of rows) {
    const classified = classifyIncome(
      {
        payerName: row.payerName,
        originCountry: row.originCountry,
        incomeType: row.incomeType,
        grossAmount: row.grossAmount.toNumber(),
        originalCurrency: row.originalCurrency,
        paymentDate: row.paymentDate.toISOString().slice(0, 10),
        periodicity: row.periodicity as "monthly" | "annual" | "one_off" | "recurring",
        nature: row.nature as "work" | "investment" | "retirement" | "asset" | "corporate" | "trust" | "other",
        notes: row.notes ?? undefined,
        exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
        grossAmountBrl: row.grossAmountBrl?.toNumber()
      },
      profile
    );
    const cls = classified.classification;
    const isCarnet = cls.calculationModule === "carnet_leao";
    const cur = row.originalCurrency.toUpperCase();
    const paymentDate = row.paymentDate.toISOString().slice(0, 10);
    const brl = resolveBrlFromIncome({
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
      paymentDate
    });
    const usd = resolveUsdFromIncome({
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      paymentDate,
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
    });
    const needsBrl =
      jurs.includes("BR") &&
      brl.requiresAdditionalReview &&
      (isCarnet || includesInOrdinaryAnnual(cls));
    const needsUsd =
      jurs.includes("US") && usd.requiresAdditionalReview && includesInUsOrdinaryAnnual(cls);
    const isGenericPayer = /^(unknown|employer|payer|income\s+source)$/i.test(row.payerName.trim());
    const isGenericType = /^(income|payment|salary)$/i.test(row.incomeType.trim()) && !row.notes;

    if (needsBrl || needsUsd) {
      const amount = row.grossAmount.toNumber();
      gaps.push({
        incomeId: row.id,
        payerName: row.payerName,
        issue: "Missing exchange rate",
        suggestion: `I cannot convert **${amount} ${cur}** automatically. Reply with a rate like **1.55 BRL per ${cur}**, or the gross in BRL (e.g. **16900 BRL**).`
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

  // Preview estimates should not stall on a rate the user cannot know yet (future pay, no PTAX pair).
  const blocking: IncomeGap[] = [];
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
    "These lines come from your **income** — you do not type them separately. If the list looks right, say **looks correct** or **yes**. To change a source, say **go back to income**.";

  if (rows.length === 0) {
    return (
      "**Income classification**\n\n" +
      `Nothing to classify yet — add at least one income line first, or say **that's all** on the income step.\n\n${cta}`
    );
  }

  const header = `**Income classification (${rows.length})** — does this look right?\n\n`;
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
    "These are **monthly Brazilian tax estimates** on foreign income (Carnê-Leão). Say **looks correct** or **yes** to continue, or tell us what to fix in income.\n\n" +
    "_Estimates only — not filing instructions._";

  if (rows.length === 0) {
    return (
      "**Monthly Brazilian tax on foreign income**\n\n" +
      "No monthly estimates apply for this profile. Say **looks correct** or **next step** to continue to the report.\n\n" +
      cta
    );
  }

  const header = `**Monthly Brazilian tax on foreign income (${rows.length} month(s))**\n\n`;
  let ytdDue = 0;
  let preliminaryMonths = 0;
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
  // Short confirmations only — do not match "continue" mid-sentence (e.g. "continue fixing income").
  if (lower.length > 64) return false;
  return (
    /^(yes|yep|yeah|ok|okay|correct|confirmed)([.!]|\s|$)/i.test(lower) ||
    /^(next(\s+step)?|proceed|continue)([.!]|\s*$)/i.test(lower) ||
    /^(looks?\s+(good|correct|right|fine)|that['']?s\s+(correct|right|fine))([.!]|\s*$)/i.test(lower)
  );
}

export function isMonthlyCalcConfirmIntent(userContent: string): boolean {
  return isEventsConfirmIntent(userContent);
}

export function isDomainStepSkipIntent(userContent: string): boolean {
  const lower = userContent.trim().toLowerCase();
  if (!lower) return false;
  return (
    /^(no|none|n\/a|skip)([.!]|\s*$)/i.test(lower) ||
    /^skip(\s+this(\s+step)?)?\b/i.test(lower) ||
    /^none(\s+(to\s+)?(add|report))?\b/i.test(lower) ||
    /^(no|none)\s+(for\s+)?(this|now)\b/i.test(lower) ||
    /\bnothing\s+to\s+(add|report)\b/i.test(lower) ||
    /\bdon['']?t\s+have(\s+(any|one|those))?([.!]|\s*$)/i.test(lower)
  );
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
  return "patrimony";
}

export function nextStateAfterPatrimony(_plan: IntakeModulePlan): ConversationState {
  return "transfers";
}

export function nextStateAfterTransfers(_plan: IntakeModulePlan): ConversationState {
  return "trust_registry";
}

export function nextStateAfterTrustRegistry(plan: IntakeModulePlan): ConversationState {
  if (plan.intakeGoal === "full_annual") return "entity_simulation";
  return "deductions";
}

export function nextStateAfterEntitySimulation(_plan: IntakeModulePlan): ConversationState {
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
  if (current === "capital_gain" && next === "deductions") return "patrimony";
  if (current === "patrimony" && next === "deductions") return "transfers";
  if (current === "transfers" && next === "deductions") return "trust_registry";
  if (current === "trust_registry" && next === "deductions" && plan.intakeGoal === "full_annual") {
    return "entity_simulation";
  }
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
  let block =
    "\n**Want a preliminary report?** Reply **proceed anyway** in chat to generate one now, or fix the items below first.\n\n**Specialist handoff**\n";
  if (requiresReview) {
    block +=
      "This case is flagged for **additional expert review**. Results are orientation only until reviewed.\n";
  }
  if (gapsSummary) {
    block += gapsSummary + "\n";
  }
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
