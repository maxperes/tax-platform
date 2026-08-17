import { fiscalResidenceSchema, type ConversationState } from "@tax-platform/shared";
import { deriveFiscalProfile } from "@tax-platform/rules";
import { prisma } from "../../db.js";
import { rewriteSafeResponse } from "../llm.js";
import { config } from "../../config.js";
import {
  describeModulePlanForUser,
  escapeTableCell,
  eventsCheckpointMessage,
  formatAmount,
  formatCapitalGainsBlockForRecap,
  formatMissingDataChecklist,
  formatMonthlySummaryBlockForRecap,
  formatMonthlyTaxForRecap,
  loadIntakeModulePlan,
  nextActionsBlock,
  resolveIncomeGaps,
  triagePromptText,
  usFilingPromptText,
  usFilingStatusLabel
} from "../intake-helpers.js";
import { getLatestTaxCalculationSnapshot } from "../tax-pipeline.js";
import {
  describeFiscalProfileForRecap,
  fiscalProfileConfirmPromptText,
  fiscalProfileSavedLead,
  getFiscalResidenceCurrentQuestion,
  isFiscalProfileConfirmPending
} from "./fiscal-orchestration.js";

export { describeFiscalProfileForRecap };

export function initialAssistantMessage(taxYear: number): string {
  return (
    `Hi — I will collect the same facts as the structured interview so we can build your **${taxYear} 360° tax map**. Filing detail is optional after that.\n\n` +
    triagePromptText()
  );
}

export function intakeRedirectForState(state: ConversationState, context: Record<string, unknown>): string {
  if (state === "fiscal_residence") {
    if (isFiscalProfileConfirmPending(context)) {
      return fiscalProfileConfirmPromptText();
    }
    return `Now, let's continue: ${getFiscalResidenceCurrentQuestion(context)}`;
  }
  if (state === "income_capture") {
    return "Add each income with **amount**, **currency**, and **date** (or **per month**). Example: **`10900 USD 2026-01-31`**. Name the type when you can (salary, pension, dividends). Say **that's all** when you are done.";
  }
  if (state === "events") {
    return "Check the income classification below. If it looks right, say **looks correct** or **yes**. To change a source, say **go back to income**.";
  }
  if (state === "deductions") {
    return (
      "Any **deductions** this year (health, education, pension)?\n\n" +
      "Example: **health insurance 2400 BRL**.\n\n" +
      "If you have none, reply **none**."
    );
  }
  if (state === "capital_gain") {
    return (
      "Did you **sell** anything this year (stocks, a home, crypto, a company share)?\n\n" +
      "If yes, describe one sale, for example:\n" +
      "**Sold 100 shares of Apple, bought Jan 2020 for 12,000 USD, sold Mar 2026 for 18,000 USD.**\n\n" +
      "If you did not sell anything, reply **none**."
    );
  }
  if (state === "patrimony") {
    return (
      "Do you want to list **assets you own** (home, investments, accounts abroad)?\n\n" +
      "Describe one, or reply **none**."
    );
  }
  if (state === "transfers") {
    return (
      "Did you **move money between countries** this year (not counting salary already listed)?\n\n" +
      "Describe one transfer, or reply **none**. Transfers to your own account are usually not extra tax."
    );
  }
  if (state === "trust_registry") {
    return (
      "Do you have a **trust** (a legal structure that holds assets for you)?\n\n" +
      "If yes, give the name, country, and whether you can revoke it. If not, reply **none**."
    );
  }
  if (state === "entity_simulation") {
    return (
      "Optional: compare paying tax as an **individual vs through a company**.\n\n" +
      "If that does not apply, reply **none**."
    );
  }
  if (state === "monthly_calc") {
    return (
      "These are **monthly Brazilian tax estimates** on foreign income (Carnê-Leão).\n\n" +
      "Say **looks correct** or **yes** to continue, or tell us what to fix."
    );
  }
  if (state === "report") {
    return "When you are ready, say **generate the report**. That saves a draft summary you can download.";
  }
  if (state === "complete") {
    return "You're done with this year's intake. To change something, say **go back to income**. After edits, say **regenerate the report**.";
  }
  return `Current step: **${state}**. Please continue with the information requested for this step.`;
}

export async function incomeCheckpointMessage(userId: string, taxYear: number): Promise<string> {
  const rows = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    take: 30,
    select: {
      payerName: true,
      originCountry: true,
      incomeType: true,
      grossAmount: true,
      originalCurrency: true,
      paymentDate: true,
      periodicity: true
    }
  });

  const cta =
    "**Add more** with a line like **`10900 USD 2026-01-31`** or **`10900 USD per month`** for monthly gross (if you omit a date we anchor to January of this tax year). Say **that's all** when you are finished.\n\n" +
    "To edit rows in a **table**, open the **income form** in the app.";

  if (rows.length === 0) {
    return (
      `**Income for your 360° map:** which categories did you receive this year (salary, self-employment, Social Security, pensions, dividends, interest, capital gains, rental, RSUs, crypto, …)? Add each source with amount, currency, and date — and say if tax was withheld abroad.\n\n${cta}\n\n_Income on file: **0** rows._`
    );
  }

  const header = `**Income on file (${rows.length})** — confirm this list or say what to change.\n\n`;
  const table =
    `| # | Payer | Country | Type | Amount | Paid | Period |\n|---|-------|---------|------|--------|------|--------|\n` +
    rows
      .map(
        (r, i) =>
          `| ${i + 1} | ${escapeTableCell(r.payerName)} | ${r.originCountry} | ${r.incomeType} | ${r.grossAmount.toNumber()} ${r.originalCurrency} | ${r.paymentDate.toISOString().slice(0, 10)} | ${r.periodicity} |`
      )
      .join("\n");

  return `${header}${table}\n\n${cta}`;
}

export async function resolveIntakeRedirect(
  state: ConversationState,
  context: Record<string, unknown>,
  userId: string,
  taxYear: number
): Promise<string> {
  if (state === "income_capture") {
    const plan = await loadIntakeModulePlan(userId, taxYear, context);
    const gaps = await resolveIncomeGaps(userId, taxYear);
    const base = await incomeCheckpointMessage(userId, taxYear);
    const planNote = describeModulePlanForUser(plan);
    if (gaps.summaryText) {
      return `${planNote}\n\n${gaps.summaryText}\n\n${base}`;
    }
    return `${planNote}\n\n${base}`;
  }
  if (state === "events") {
    return eventsCheckpointMessage(userId, taxYear);
  }
  if (state === "monthly_calc") {
    return formatMonthlyTaxForRecap(userId, taxYear);
  }
  return intakeRedirectForState(state, context);
}

export async function postToolCallAssistantText(
  userId: string,
  prevState: ConversationState,
  newState: ConversationState,
  taxYear: number,
  context: Record<string, unknown>
): Promise<string> {
  if (prevState === "fiscal_residence" && (newState === "income_capture" || newState === "fiscal_residence")) {
    const fr = context.fiscalResidence;
    const parsed =
      fr && typeof fr === "object"
        ? fiscalResidenceSchema.safeParse(fr)
        : ({ success: false } as const);
    if (parsed.success) {
      const profile = deriveFiscalProfile(parsed.data);
      const tail =
        context._usFilingPending === true
          ? usFilingPromptText(context)
          : await resolveIntakeRedirect("income_capture", context, userId, taxYear);
      const us = context.usFilingInputs as { filingStatus?: string } | undefined;
      const inferredNote =
        newState === "income_capture" &&
        (us?.filingStatus === "single" || us?.filingStatus === "mfj" || us?.filingStatus === "hoh")
          ? `We'll use **${usFilingStatusLabel(us.filingStatus)}** for the US estimate.\n\n`
          : "";
      return `${fiscalProfileSavedLead({
        taxYear,
        profile: profile.profile,
        requiresAdditionalReview: profile.requiresAdditionalReview,
        fullName: parsed.data.fullName
      })}\n\n${inferredNote}${tail}`;
    }
    if (newState === "fiscal_residence") {
      return getFiscalResidenceCurrentQuestion(context);
    }
    return await resolveIntakeRedirect(newState, context, userId, taxYear);
  }
  if (newState !== prevState) {
    const stepLabel = newState.replace(/_/g, " ");
    return `You are now on **${stepLabel}**.\n\n${await resolveIntakeRedirect(newState, context, userId, taxYear)}`;
  }
  return `I saved that.\n\n${await resolveIntakeRedirect(newState, context, userId, taxYear)}`;
}

/** Richer than net-only so users see the engine ran when net due is legitimately zero. */
function formatAnnualEstimatesForRecap(estimates: Record<string, unknown>[]): string {
  const jurOrder = (j: string) => (j === "BR" ? 0 : j === "US" ? 1 : 9);
  const sorted = [...estimates].sort(
    (a, b) => jurOrder(String(a.jurisdiction ?? "")) - jurOrder(String(b.jurisdiction ?? ""))
  );
  return sorted
    .map((c) => {
      const jur = String(c.jurisdiction ?? "?");
      const cur = String(c.currency ?? "");
      const gross = Number(c.grossIncome);
      const base = Number(c.taxableBase);
      const gTax = Number(c.grossTax);
      const credit = Number(c.taxCreditApplied ?? 0);
      const net = Number(c.netTaxDue);
      const status = String(c.calculationStatus ?? "");
      let line = `- **${jur}** (${cur}): modeled gross **${formatAmount(gross, cur)}** · taxable base **${formatAmount(base, cur)}** · gross tax **${formatAmount(gTax, cur)}** · credit applied **${formatAmount(credit, cur)}** · **net due ${formatAmount(net, cur)}** (${status})`;
      if (net === 0 && gross > 0) {
        if (jur === "US") {
          line +=
            "\n  _Federal ordinary tax is modeled on taxable income after the standard deduction; at this income level the modeled taxable base is **zero**, so net due is **zero** before credits._";
        } else if (jur === "BR") {
          line +=
            "\n  _The modeled annual IRPF-style table has a **0%** band on the first slice of taxable base (about **R$ 28,560** in this pack), so gross tax can be **zero** at modest totals._";
        }
      }
      return line;
    })
    .join("\n");
}

export async function formatIntakeRecapForChat(userId: string, taxYear: number, reportId: string): Promise<string> {
  const incomes = await prisma.incomeSource.findMany({
    where: { userId, taxYear },
    orderBy: [{ paymentDate: "desc" }],
    select: {
      payerName: true,
      incomeType: true,
      grossAmount: true,
      originalCurrency: true,
      paymentDate: true,
      grossAmountBrl: true
    }
  });
  const [ec, dc, cg, mc, fp, reportRow] = await Promise.all([
    prisma.taxableEvent.count({ where: { userId, taxYear } }),
    prisma.deduction.count({ where: { userId, taxYear } }),
    prisma.capitalGainCalculation.count({ where: { userId, taxYear } }),
    prisma.monthlyTaxCalculation.count({ where: { userId, taxYear } }),
    prisma.fiscalResidenceProfile.findUnique({ where: { userId_taxYear: { userId, taxYear } } }),
    prisma.taxReport.findUnique({ where: { id: reportId } })
  ]);
  const ic = incomes.length;
  const profileRaw = fp?.derivedProfile ?? "undetermined";
  const profileLine = describeFiscalProfileForRecap(profileRaw);
  const needsReview =
    (fp?.requiresAdditionalReview ?? false) || (reportRow?.requiresAdditionalReview ?? false);
  const reviewNote = needsReview
    ? "\n\n**Review flag:** this year is marked for **additional expert review** before relying on any numbers."
    : "";

  const reportTitle = reportRow?.title ?? `Tax report ${taxYear}`;
  const stamp = reportRow?.ruleVersion ? `\n- **Rules / data stamp on file:** \`${reportRow.ruleVersion}\`` : "";

  const incomeLines = incomes.slice(0, 6).map((r) => {
    const amt = formatAmount(r.grossAmount.toNumber(), r.originalCurrency);
    const d = r.paymentDate.toISOString().slice(0, 10);
    return `- **${r.payerName}** · ${r.incomeType} · **${amt}** · paid ${d}`;
  });
  const incomeMore = ic > 6 ? `\n- _…and ${ic - 6} more income line(s)._` : "";

  const withBrl = incomes.filter((r) => r.grossAmountBrl != null);
  let brlBlock = "";
  if (withBrl.length > 0) {
    const sumBrl = withBrl.reduce((s, r) => s + (r.grossAmountBrl?.toNumber() ?? 0), 0);
    brlBlock = `\n**BRL roll-up (where we stored BRL on each line):** about **${formatAmount(sumBrl, "BRL")}** across **${withBrl.length}** of **${ic}** income lines. This is still not a final IRPF result.\n`;
  } else if (ic > 0) {
    brlBlock =
      "\n_No BRL equivalents were stored on the income rows yet, so no BRL total is shown here._\n";
  }

  const incomeBlock =
    ic > 0
      ? `\n**Income lines (up to six, newest first)**\n${incomeLines.join("\n")}${incomeMore}${brlBlock}\n`
      : "\n_No income rows are on file for this year yet._\n\n";

  const annualEstimates = await getLatestTaxCalculationSnapshot(userId, taxYear);
  let annualEstimatesBlock = "";
  if (annualEstimates.length > 0) {
    annualEstimatesBlock =
      "\n**Annual engine estimates (snapshot, per jurisdiction)**\n" +
      formatAnnualEstimatesForRecap(annualEstimates) +
      "\n_Full numeric fields are also under `summaryJson.annualTaxEstimates` in the downloaded report JSON._\n";
  } else {
    annualEstimatesBlock =
      "\n_No annual tax estimate rows are on file for this year yet (the engine may not have produced a snapshot)._\n";
  }

  const monthlyBlock = await formatMonthlySummaryBlockForRecap(userId, taxYear);
  const capitalBlock = await formatCapitalGainsBlockForRecap(userId, taxYear);
  const checklist = await formatMissingDataChecklist(userId, taxYear);
  const actions = nextActionsBlock();

  return (
    `**Yes — a report was generated.** A **TaxReport** database record was created for **${taxYear}** (title: **${reportTitle}**). It stores the JSON bundle the product uses for review (incomes, taxable events, deductions, monthly snapshots, capital-gain inputs, and **per-jurisdiction annual estimates** with gross, taxable base, and tax lines—not only net due).${stamp}\n\n` +
    `**Profile (modeled):** ${profileLine}\n\n` +
    `**What is in that report**\n` +
    `- Income lines: **${ic}**\n` +
    `- Taxable events (derived): **${ec}**\n` +
    `- Deductions: **${dc}**\n` +
    `- Capital gain calculations: **${cg}**\n` +
    `- Monthly tax snapshots on file: **${mc}**\n` +
    incomeBlock +
    monthlyBlock +
    capitalBlock +
    annualEstimatesBlock +
    checklist +
    `All of the above is **orientation only**—not a filing position.${reviewNote}\n\n` +
    actions +
    `If anything is wrong, reply with the payer, date, or amount to correct.`
  );
}

export async function offTopicRedirect(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  userId: string
): Promise<string> {
  if (state === "fiscal_residence") {
    return `I can only help you complete this tax intake for **${taxYear}**. I can't answer unrelated questions here.\n\n${getFiscalResidenceCurrentQuestion(context)}`;
  }
  if (state === "income_capture") {
    return (
      `I can only help you complete this tax intake for **${taxYear}**. I can't answer unrelated questions here.\n\n` +
      (await incomeCheckpointMessage(userId, taxYear))
    );
  }
  return `I can only help you complete this tax intake for **${taxYear}**. I can't answer unrelated questions here.\n\nCurrent step: **${state}**. Please continue with the information requested for this step.`;
}

function trustConcernCoreResponse(taxYear: number, userContent: string): string {
  const lower = userContent.trim().toLowerCase();
  const isPrivacyPolicyLocationQuestion =
    /\b(where|find|link|url|read|see|access)\b.*\b(privacy policy|privacy notice|data policy)\b|\b(privacy policy|privacy notice|data policy)\b.*\b(where|find|link|url|read|see|access)\b/i.test(
      lower
    );
  if (isPrivacyPolicyLocationQuestion) {
    return config.privacyPolicyUrl
      ? `You can read our privacy policy here: ${config.privacyPolicyUrl}`
      : "The privacy policy URL is not configured in this environment yet. Please contact support/admin for the official policy link.";
  }
  return (
    `Yes, we store the information you provide in this tax intake for ${taxYear} so we can prepare your assessment and keep your session progress. ` +
    "Access is limited to your account and authorized service operations. " +
    "You can export or delete your data anytime from Privacy settings in the app (export my data / delete my account)."
  );
}

export async function trustConcernResponseWithTone(
  state: ConversationState,
  taxYear: number,
  context: Record<string, unknown>,
  userContent: string,
  userId: string
): Promise<string> {
  const deterministicCore = trustConcernCoreResponse(taxYear, userContent);
  const intakeRedirect = await resolveIntakeRedirect(state, context, userId, taxYear);
  if (!config.llmEnabled) return `${deterministicCore}\n\n${intakeRedirect}`;
  try {
    const rewrittenCore = await rewriteSafeResponse({
      userMessage: userContent,
      deterministicAnswer: deterministicCore
    });
    return `${rewrittenCore}\n\n${intakeRedirect}`;
  } catch {
    return `${deterministicCore}\n\n${intakeRedirect}`;
  }
}
