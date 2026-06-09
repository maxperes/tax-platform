import {
  incomeSourceSchema,
  type FiscalProfile,
  DATA_PACK_BR_2026,
  DATA_PACK_US_2026
} from "@tax-platform/shared";
import {
  classifyIncome,
  detectTaxableEventsFromIncomes,
  jurisdictionsForProfile,
  getBrRulePack,
  getUsRulePack,
  buildBrAnnualEstimate,
  buildUsAnnualEstimate,
  applyCarneLeaoTaxToItems,
  aggregateMonthlyCarnetLeao,
  buildTaxReportSummary,
  resolveBrlFromIncome,
  resolveUsdFromIncome
} from "@tax-platform/rules";
import type { Prisma, TaxCalculation } from "@prisma/client";
import { prisma } from "../db.js";
import { buildStampWithOverrides, loadRulePatches } from "./rule-overrides.js";

type Db = Prisma.TransactionClient | typeof prisma;

function dbClient(tx?: Prisma.TransactionClient): Db {
  return tx ?? prisma;
}

const incomeRowBaseSchema = incomeSourceSchema.omit({ classification: true });

/** RF-003 sync: rebuild TaxableEvent rows from incomes. */
export async function syncTaxableEvents(userId: string, taxYear: number): Promise<number> {
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const incomes = await prisma.incomeSource.findMany({ where: { userId, taxYear } });
  const parsed = incomes.map((row) => {
    const base = incomeRowBaseSchema.parse({
      payerName: row.payerName,
      originCountry: row.originCountry,
      incomeType: row.incomeType,
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      periodicity: row.periodicity,
      taxPaidOriginCountry: row.taxPaidOriginCountry?.toNumber(),
      withholdingTax: row.withholdingTax?.toNumber(),
      hasProofDocument: row.hasProofDocument ?? undefined,
      destinationAccountHint: row.destinationAccountHint ?? undefined,
      transferredToBrazil: row.transferredToBrazil ?? undefined,
      remainedAbroad: row.remainedAbroad ?? undefined,
      nature: row.nature,
      notes: row.notes ?? undefined,
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
      grossAmountBrl: row.grossAmountBrl?.toNumber()
    });
    return classifyIncome(base, profile);
  });
  const detected = detectTaxableEventsFromIncomes(parsed);
  await prisma.taxableEvent.deleteMany({ where: { userId, taxYear } });
  for (let i = 0; i < detected.length; i++) {
    const e = detected[i]!;
    const incomeRow = incomes[i]!;
    const incomeParsed = parsed[i]!;
    await prisma.taxableEvent.create({
      data: {
        userId,
        taxYear,
        eventType: e.eventType,
        description: e.description,
        occurredOn: new Date(incomeParsed.paymentDate),
        isTaxable: e.isTaxable,
        requiresReview: e.requiresReview,
        incomeSourceId: incomeRow.id,
        amountBrl: incomeParsed.grossAmountBrl ?? undefined,
        currency: incomeParsed.originalCurrency,
        amountOriginal: incomeParsed.grossAmount
      }
    });
  }
  return detected.length;
}

export async function recomputeMonthlyTax(
  userId: string,
  taxYear: number,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = dbClient(tx);
  const fp = await db.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = fp?.derivedProfile ?? "undetermined";
  if (profile === "resident_usa") {
    return;
  }

  const brPatches = await loadRulePatches("BR", taxYear);
  const brPack = getBrRulePack(brPatches);
  const ruleStamp = buildStampWithOverrides(brPack.dataPackId, brPatches);

  const incomes = await db.incomeSource.findMany({ where: { userId, taxYear } });
  const items = [];
  for (const row of incomes) {
    const cls = row.classification as { calculationModule?: string } | null;
    if (cls?.calculationModule !== "carnet_leao") continue;
    const fx = resolveBrlFromIncome({
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
    });
    const requiresReview = (fp?.requiresAdditionalReview ?? false) || fx.requiresAdditionalReview;
    items.push({
      incomeSourceId: row.id,
      taxEventId: undefined,
      incomeType: row.incomeType,
      originCountry: row.originCountry,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      originalAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      exchangeRate: fx.exchangeRate,
      amountBrl: fx.amountBrl,
      foreignTaxPaid: row.taxPaidOriginCountry?.toNumber(),
      deductionAmount: 0,
      exemptionAmount: 0,
      taxableAmount: fx.amountBrl,
      calculatedTax: 0,
      requiresReview,
      notes: fx.notes
    });
  }
  const taxedItems = applyCarneLeaoTaxToItems(items, brPack);
  const aggregates = aggregateMonthlyCarnetLeao(taxedItems, { ruleVersion: ruleStamp });
  for (const agg of aggregates) {
    const parent = await db.monthlyTaxCalculation.upsert({
      where: {
        userId_taxYear_taxMonth: { userId, taxYear, taxMonth: agg.month }
      },
      create: {
        userId,
        taxYear,
        taxMonth: agg.month,
        fiscalResidenceStatus: fp?.derivedProfile ?? null,
        totalForeignIncomeBrl: agg.taxableBaseBrl,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.grossTax,
        calculationStatus: agg.requiresAdditionalReview ? "preliminary" : "complete",
        requiresAdditionalReview: agg.requiresAdditionalReview,
        ruleVersion: agg.ruleVersion,
        jurisdiction: "BR",
        dataPackVersion: brPack.dataPackId
      },
      update: {
        totalForeignIncomeBrl: agg.taxableBaseBrl,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.grossTax,
        calculationStatus: agg.requiresAdditionalReview ? "preliminary" : "complete",
        requiresAdditionalReview: agg.requiresAdditionalReview,
        ruleVersion: agg.ruleVersion,
        jurisdiction: "BR",
        dataPackVersion: brPack.dataPackId
      }
    });
    await db.monthlyTaxCalculationItem.deleteMany({
      where: { monthlyTaxCalculationId: parent.id }
    });
    for (const it of agg.items) {
      await db.monthlyTaxCalculationItem.create({
        data: {
          monthlyTaxCalculationId: parent.id,
          incomeSourceId: it.incomeSourceId ?? null,
          incomeType: it.incomeType,
          originCountry: it.originCountry,
          paymentDate: new Date(it.paymentDate),
          originalAmount: it.originalAmount,
          originalCurrency: it.originalCurrency,
          exchangeRate: it.exchangeRate,
          amountBrl: it.amountBrl,
          foreignTaxPaid: it.foreignTaxPaid ?? null,
          deductionAmount: it.deductionAmount ?? null,
          exemptionAmount: it.exemptionAmount ?? null,
          taxableAmount: it.taxableAmount,
          calculatedTax: it.calculatedTax,
          requiresReview: it.requiresReview ?? false,
          notes: it.notes ?? null
        }
      });
    }
  }
}

function serializeTaxCalculationRow(r: TaxCalculation): Record<string, unknown> {
  return {
    id: r.id,
    jurisdiction: r.jurisdiction,
    calculationType: r.calculationType,
    currency: r.currency,
    grossIncome: r.grossIncome.toNumber(),
    deductionsTotal: r.deductionsTotal.toNumber(),
    exemptionsTotal: r.exemptionsTotal.toNumber(),
    taxableBase: r.taxableBase.toNumber(),
    appliedRate: r.appliedRate.toNumber(),
    grossTax: r.grossTax.toNumber(),
    foreignTaxPaid: r.foreignTaxPaid?.toNumber() ?? null,
    taxCreditApplied: r.taxCreditApplied?.toNumber() ?? null,
    netTaxDue: r.netTaxDue.toNumber(),
    calculationStatus: r.calculationStatus,
    requiresAdditionalReview: r.requiresAdditionalReview,
    ruleVersion: r.ruleVersion,
    dataPackVersion: r.dataPackVersion ?? null,
    feieApplied: r.feieApplied?.toNumber() ?? null,
    ftcApplied: r.ftcApplied?.toNumber() ?? null,
    niit: r.niit?.toNumber() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString()
  };
}

/** One row per jurisdiction: the newest TaxCalculation for that user/year/jurisdiction. */
export async function getLatestTaxCalculationSnapshot(
  userId: string,
  taxYear: number,
  tx?: Prisma.TransactionClient
): Promise<Record<string, unknown>[]> {
  const db = dbClient(tx);
  const rows = await db.taxCalculation.findMany({
    where: { userId, taxYear },
    orderBy: { createdAt: "desc" }
  });
  const byJurisdiction = new Map<string, TaxCalculation>();
  for (const row of rows) {
    if (!byJurisdiction.has(row.jurisdiction)) byJurisdiction.set(row.jurisdiction, row);
  }
  return [...byJurisdiction.values()].map(serializeTaxCalculationRow);
}

function buildReportRuleVersion(
  jurs: ReturnType<typeof jurisdictionsForProfile>,
  brPatches: { key: string; value: unknown }[],
  usPatches: { key: string; value: unknown }[]
): string {
  if (jurs.includes("BR") && jurs.includes("US")) {
    return `${buildStampWithOverrides(DATA_PACK_BR_2026, brPatches)}+${buildStampWithOverrides(DATA_PACK_US_2026, usPatches)}`;
  }
  if (jurs.includes("US")) {
    return buildStampWithOverrides(DATA_PACK_US_2026, usPatches);
  }
  return buildStampWithOverrides(DATA_PACK_BR_2026, brPatches);
}

export type UsFilingInputsForEstimate = {
  filingStatus: "single" | "mfj" | "hoh";
  foreignEarnedIncomeUsd?: number;
  netInvestmentIncomeUsd?: number;
};

export async function estimateAnnualTax(
  userId: string,
  taxYear: number,
  tx?: Prisma.TransactionClient,
  usFiling?: UsFilingInputsForEstimate
): Promise<void> {
  const db = dbClient(tx);
  const incomes = await db.incomeSource.findMany({ where: { userId, taxYear } });
  const deductions = await db.deduction.findMany({ where: { userId, taxYear } });
  const fp = await db.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurs = jurisdictionsForProfile(profile);
  const brPatches = await loadRulePatches("BR", taxYear);
  const usPatches = await loadRulePatches("US", taxYear);
  const brPack = getBrRulePack(brPatches);
  const usPack = getUsRulePack(usPatches);

  for (const jurisdiction of jurs) {
    if (jurisdiction === "BR") {
      let grossBrl = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const fx = resolveBrlFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency,
          grossAmountBrl: row.grossAmountBrl?.toNumber(),
          exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
        });
        grossBrl += fx.amountBrl;
        review ||= fx.requiresAdditionalReview;
      }
      const dedBrl = deductions.reduce((s, d) => s + (d.amountBrl?.toNumber() ?? d.amount.toNumber()), 0);
      const foreignBrl = incomes.reduce((s, i) => s + (i.taxPaidOriginCountry?.toNumber() ?? 0), 0);
      const est = buildBrAnnualEstimate({
        taxYear,
        grossIncomeBrl: grossBrl,
        deductionsTotalBrl: dedBrl,
        exemptionsTotalBrl: 0,
        foreignTaxPaidBrl: foreignBrl,
        requiresAdditionalReview: review,
        pack: brPack
      });
      const ruleVersion = buildStampWithOverrides(brPack.dataPackId, brPatches);
      await db.taxCalculation.create({
        data: {
          userId,
          taxYear: est.taxYear,
          calculationType: est.calculationType,
          grossIncome: est.grossIncome,
          deductionsTotal: est.deductionsTotal,
          exemptionsTotal: est.exemptionsTotal,
          taxableBase: est.taxableBase,
          appliedRate: est.appliedRate,
          grossTax: est.grossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: est.netTaxDue,
          currency: est.currency,
          calculationStatus: est.calculationStatus,
          requiresAdditionalReview: est.requiresAdditionalReview,
          ruleVersion,
          jurisdiction: "BR",
          dataPackVersion: est.dataPackVersion ?? brPack.dataPackId,
          feieApplied: null,
          ftcApplied: null,
          niit: null
        }
      });
    } else {
      let grossUsd = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const fx = resolveUsdFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency
        });
        grossUsd += fx.amountUsd;
        review ||= fx.requiresAdditionalReview;
      }
      let dedUsd = 0;
      for (const d of deductions) {
        if (d.currency === "USD") {
          dedUsd += d.amount.toNumber();
        } else if (d.currency === "BRL" && d.amountBrl) {
          review = true;
        } else {
          review = true;
        }
      }
      const foreignUsd = incomes.reduce((s, i) => s + (i.taxPaidOriginCountry?.toNumber() ?? 0), 0);
      const est = buildUsAnnualEstimate({
        taxYear,
        grossIncomeUsd: grossUsd,
        deductionsUsd: dedUsd,
        exemptionsUsd: 0,
        foreignTaxPaidUsd: foreignUsd,
        foreignEarnedIncomeUsd: usFiling?.foreignEarnedIncomeUsd ?? 0,
        netInvestmentIncomeUsd: usFiling?.netInvestmentIncomeUsd ?? 0,
        filingStatus: usFiling?.filingStatus ?? "single",
        requiresAdditionalReview: review,
        pack: usPack
      });
      const ruleVersion = buildStampWithOverrides(usPack.dataPackId, usPatches);
      await db.taxCalculation.create({
        data: {
          userId,
          taxYear: est.taxYear,
          calculationType: est.calculationType,
          grossIncome: est.grossIncome,
          deductionsTotal: est.deductionsTotal,
          exemptionsTotal: est.exemptionsTotal,
          taxableBase: est.taxableBase,
          appliedRate: est.appliedRate,
          grossTax: est.grossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: est.netTaxDue,
          currency: est.currency,
          calculationStatus: est.calculationStatus,
          requiresAdditionalReview: est.requiresAdditionalReview,
          ruleVersion,
          jurisdiction: "US",
          dataPackVersion: est.dataPackVersion ?? usPack.dataPackId,
          feieApplied: est.feieApplied ?? null,
          ftcApplied: est.ftcApplied ?? null,
          niit: est.niit ?? null
        }
      });
    }
  }
}

async function loadUsFilingInputsForUser(userId: string, taxYear: number): Promise<UsFilingInputsForEstimate | undefined> {
  const session = await prisma.conversationSession.findFirst({
    where: { userId, taxYear },
    orderBy: { updatedAt: "desc" },
    select: { contextJson: true }
  });
  const ctx = (session?.contextJson as Record<string, unknown> | null) ?? {};
  const raw = ctx.usFilingInputs;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const filingStatus = (raw as { filingStatus?: string }).filingStatus;
  if (filingStatus !== "single" && filingStatus !== "mfj" && filingStatus !== "hoh") {
    return undefined;
  }
  return {
    filingStatus,
    foreignEarnedIncomeUsd: Number((raw as { foreignEarnedIncomeUsd?: number }).foreignEarnedIncomeUsd ?? 0),
    netInvestmentIncomeUsd: Number((raw as { netInvestmentIncomeUsd?: number }).netInvestmentIncomeUsd ?? 0)
  };
}

export async function buildAndSaveReport(userId: string, taxYear: number): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await syncTaxableEvents(userId, taxYear);
    await recomputeMonthlyTax(userId, taxYear, tx);
    const usFiling = await loadUsFilingInputsForUser(userId, taxYear);
    await estimateAnnualTax(userId, taxYear, tx, usFiling);

    const fp = await tx.fiscalResidenceProfile.findUnique({
      where: { userId_taxYear: { userId, taxYear } }
    });
    const incomes = await tx.incomeSource.findMany({ where: { userId, taxYear } });
    const events = await tx.taxableEvent.findMany({ where: { userId, taxYear } });
    const deductions = await tx.deduction.findMany({ where: { userId, taxYear } });
    const monthly = await tx.monthlyTaxCalculation.findMany({ where: { userId, taxYear } });
    const capitalGains = await tx.capitalGainCalculation.findMany({ where: { userId, taxYear } });
    const requiresAdditionalReview =
      (fp?.requiresAdditionalReview ?? false) ||
      events.some((e) => e.requiresReview) ||
      monthly.some((m) => m.requiresAdditionalReview);

    const prof = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
    const jurs = jurisdictionsForProfile(prof);
    const brPatches = await loadRulePatches("BR", taxYear);
    const usPatches = await loadRulePatches("US", taxYear);
    const reportRuleVersion = buildReportRuleVersion(jurs, brPatches, usPatches);
    const reportJurisdiction = jurs.includes("BR") && jurs.includes("US") ? "BR+US" : jurs.includes("US") ? "US" : "BR";

    const annualTaxEstimates = await getLatestTaxCalculationSnapshot(userId, taxYear, tx);

    const summary = buildTaxReportSummary({
      taxYear,
      fiscalProfile: fp?.derivedProfile ?? "unknown",
      incomes,
      events,
      deductions,
      monthly,
      capitalGains,
      annualTaxEstimates,
      requiresAdditionalReview,
      ruleVersion: reportRuleVersion
    });

    const report = await tx.taxReport.create({
      data: {
        userId,
        taxYear,
        title: summary.title,
        summaryJson: summary.summaryJson as Prisma.InputJsonValue,
        requiresAdditionalReview: summary.requiresAdditionalReview,
        ruleVersion: summary.ruleVersion,
        jurisdiction: reportJurisdiction,
        dataPackVersion: reportRuleVersion
      }
    });
    return report.id;
  });
}
