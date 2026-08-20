import {
  incomeSourceSchema,
  type FiscalProfile,
  assetSchema,
  internationalTransferSchema,
  trustStructureSchema,
  exemptionSchema
} from "@tax-platform/shared";
import {
  classifyIncome,
  detectTaxableEventsFromIncomes,
  detectTaxableEventsFromAssets,
  detectTaxableEventsFromTransfers,
  detectTaxableEventsFromTrusts,
  assessInternationalTransfer,
  assessTrustStructure,
  jurisdictionsForProfile,
  getBrRulePackForYear,
  getUsRulePackForYear,
  buildBrAnnualEstimate,
  buildUsAnnualEstimate,
  buildTaxReportSummary,
  resolveBrlFromIncome,
  resolveUsdFromIncome,
  sumDeductionsForScope,
  sumExemptionsForScope,
  includesInOrdinaryAnnual,
  includesInUsOrdinaryAnnual,
  isCarnetLeaoLine,
  isLei14754Eligible,
  allocateMonthlyOffsets,
  convertForeignTaxToBrl,
  convertForeignTaxToUsd,
  classifiedIncomeToIrpfExtItem,
  computeMonthlyViaIrpfExt001
} from "@tax-platform/rules";
import type { Prisma, TaxCalculation } from "../prisma-client.js";
import { prisma } from "../db.js";
import { buildStampWithOverrides, buildRuleVersionForJurisdictions, loadRulePatches } from "./rule-overrides.js";

type Db = Prisma.TransactionClient | typeof prisma;

function dbClient(tx?: Prisma.TransactionClient): Db {
  return tx ?? prisma;
}

function residencyContextFromFiscal(
  data: unknown,
  taxYear: number
): { start: string; end?: string; dependents: number; age?: number } {
  const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const start =
    (typeof raw.fiscalResidenceBrazilStartDate === "string" && raw.fiscalResidenceBrazilStartDate) ||
    (typeof raw.firstEntryBrazilDate === "string" && raw.firstEntryBrazilDate) ||
    `${taxYear}-01-01`;
  const end =
    typeof raw.fiscalResidenceBrazilEndDate === "string" ? raw.fiscalResidenceBrazilEndDate : undefined;
  const dependents = typeof raw.dependentsCount === "number" ? raw.dependentsCount : 0;
  let age: number | undefined;
  if (typeof raw.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.birthDate)) {
    age = Math.max(0, taxYear - Number(raw.birthDate.slice(0, 4)));
  }
  return { start, end, dependents, age };
}

const incomeRowBaseSchema = incomeSourceSchema.omit({ classification: true });

function classifiedFromDbIncome(
  row: {
    payerName: string;
    originCountry: string;
    incomeType: string;
    grossAmount: { toNumber: () => number };
    originalCurrency: string;
    paymentDate: Date;
    periodicity: string;
    taxPaidOriginCountry: { toNumber: () => number } | null;
    withholdingTax: { toNumber: () => number } | null;
    hasProofDocument: boolean | null;
    destinationAccountHint: string | null;
    transferredToBrazil: boolean | null;
    remainedAbroad: boolean | null;
    nature: string;
    notes: string | null;
    exchangeRateToBrl: { toNumber: () => number } | null;
    grossAmountBrl: { toNumber: () => number } | null;
  },
  profile: FiscalProfile
) {
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
}

/** RF-003 sync: rebuild TaxableEvent rows from incomes, assets, transfers, and trusts. */
export async function syncTaxableEvents(
  userId: string,
  taxYear: number,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const db = dbClient(tx);
  const fp = await db.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const [incomes, assetRows, transferRows, trustRows] = await Promise.all([
    db.incomeSource.findMany({ where: { userId, taxYear } }),
    db.asset.findMany({ where: { userId, taxYear } }),
    db.internationalTransfer.findMany({ where: { userId, taxYear } }),
    db.trustStructure.findMany({ where: { userId, taxYear } })
  ]);
  const parsed = incomes.map((row) => classifiedFromDbIncome(row, profile));
  const incomeEvents = detectTaxableEventsFromIncomes(parsed);
  const assetsParsed = assetRows.map((r) =>
    assetSchema.parse({
      name: r.name,
      assetType: r.assetType,
      country: r.country,
      acquisitionDate: r.acquisitionDate.toISOString().slice(0, 10),
      acquisitionValue: r.acquisitionValue.toNumber(),
      acquisitionCurrency: r.acquisitionCurrency,
      currentValue: r.currentValue?.toNumber(),
      currentCurrency: r.currentCurrency ?? undefined,
      isForeignAsset: r.isForeignAsset,
      notes: r.notes ?? undefined,
      dataOrigin: r.dataOrigin
    })
  );
  const transfersParsed = transferRows.map((r) =>
    internationalTransferSchema.parse({
      fromCountry: r.fromCountry,
      toCountry: r.toCountry,
      amount: r.amount.toNumber(),
      currency: r.currency,
      transferDate: r.transferDate.toISOString().slice(0, 10),
      classification: r.classification,
      relatedIncomeId: r.relatedIncomeId ?? undefined,
      relatedTrustId: r.relatedTrustId ?? undefined,
      notes: r.notes ?? undefined,
      dataOrigin: r.dataOrigin
    })
  );
  const transferAssessments = transfersParsed.map((t) => assessInternationalTransfer(t));
  const trustsParsed = trustRows.map((r) =>
    trustStructureSchema.parse({
      name: r.name,
      jurisdiction: r.jurisdiction,
      trustType: r.trustType,
      settlorName: r.settlorName ?? undefined,
      beneficiaryNames: (r.beneficiaryNames as string[] | null) ?? undefined,
      isGrantorTrust: r.isGrantorTrust ?? undefined,
      annualDistributionsUsd: r.annualDistributionsUsd?.toNumber(),
      notes: r.notes ?? undefined,
      dataOrigin: r.dataOrigin
    })
  );
  const trustAssessments = trustsParsed.map((t) => assessTrustStructure(t));

  const allEvents = [
    ...incomeEvents.map((e, i) => ({ e, incomeRow: incomes[i]!, incomeParsed: parsed[i]! })),
    ...detectTaxableEventsFromAssets(assetsParsed).map((e) => ({ e, incomeRow: null, incomeParsed: null })),
    ...detectTaxableEventsFromTransfers(transfersParsed, transferAssessments).map((e) => ({
      e,
      incomeRow: null,
      incomeParsed: null
    })),
    ...detectTaxableEventsFromTrusts(trustsParsed, trustAssessments).map((e) => ({
      e,
      incomeRow: null,
      incomeParsed: null
    }))
  ];

  await db.taxableEvent.deleteMany({ where: { userId, taxYear } });
  if (allEvents.length > 0) {
    await db.taxableEvent.createMany({
      data: allEvents.map(({ e, incomeRow, incomeParsed }) => ({
        userId,
        taxYear,
        eventType: e.eventType,
        description: e.description,
        occurredOn: incomeParsed
          ? new Date(incomeParsed.paymentDate)
          : new Date(`${taxYear}-12-31`),
        isTaxable: e.isTaxable,
        requiresReview: e.requiresReview,
        incomeSourceId: incomeRow?.id ?? null,
        amountBrl: incomeParsed?.grossAmountBrl ?? undefined,
        currency: incomeParsed?.originalCurrency ?? undefined,
        amountOriginal: incomeParsed?.grossAmount ?? undefined
      }))
    });
  }
  return allEvents.length;
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
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  if (profile === "resident_usa") {
    return;
  }

  const brPatches = await loadRulePatches("BR", taxYear);
  const brPack = getBrRulePackForYear(taxYear, brPatches);
  const ruleStamp = buildStampWithOverrides(brPack.dataPackId, brPatches);

  const [incomes, deductionRows, exemptionRows] = await Promise.all([
    db.incomeSource.findMany({ where: { userId, taxYear } }),
    db.deduction.findMany({ where: { userId, taxYear } }),
    db.exemption.findMany({ where: { userId, taxYear } })
  ]);
  const deductions = deductionRows.map((d) => ({
    deductionType: d.deductionType,
    amount: d.amount.toNumber(),
    currency: d.currency,
    amountBrl: d.amountBrl?.toNumber(),
    taxPeriod: d.taxPeriod,
    applicationScope: d.applicationScope as "monthly" | "annual" | "transaction",
    relatedIncomeId: d.relatedIncomeId ?? undefined,
    requiresProof: d.requiresProof ?? undefined,
    proofDocumentUrl: d.proofDocumentUrl ?? undefined,
    dataOrigin: d.dataOrigin as "manual"
  }));
  const exemptions = exemptionRows.map((e) =>
    exemptionSchema.parse({
      exemptionType: e.exemptionType,
      amount: e.amount.toNumber(),
      currency: e.currency,
      amountBrl: e.amountBrl?.toNumber(),
      taxPeriod: e.taxPeriod,
      applicationScope: e.applicationScope,
      notes: e.notes ?? undefined,
      dataOrigin: e.dataOrigin
    })
  );
  const monthlyDeductionTotal = sumDeductionsForScope(deductions, "monthly", "BRL");
  const monthlyExemptionTotal = sumExemptionsForScope(exemptions, "monthly", "BRL");

  const carnetRows = incomes.filter((row) =>
    isCarnetLeaoLine(classifiedFromDbIncome(row, profile).classification)
  );
  const lineOffsets = allocateMonthlyOffsets(
    carnetRows.map((row) => ({
      incomeSourceId: row.id,
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      amountBrl: 0
    })),
    deductions,
    exemptions
  );

  const items = [];
  for (const row of carnetRows) {
    const cls = classifiedFromDbIncome(row, profile).classification;
    const paymentDate = row.paymentDate.toISOString().slice(0, 10);
    const fx = resolveBrlFromIncome({
      grossAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      grossAmountBrl: row.grossAmountBrl?.toNumber(),
      exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
      paymentDate
    });
    const requiresReview = (fp?.requiresAdditionalReview ?? false) || fx.requiresAdditionalReview;
    const offsets = lineOffsets.get(row.id) ?? { deduction: 0, exemption: 0 };
    const taxableAmount = Math.max(0, fx.amountBrl - offsets.deduction - offsets.exemption);
    items.push({
      incomeSourceId: row.id,
      taxEventId: undefined,
      incomeType: row.incomeType,
      originCountry: row.originCountry,
      paymentDate,
      originalAmount: row.grossAmount.toNumber(),
      originalCurrency: row.originalCurrency,
      exchangeRate: fx.exchangeRate,
      amountBrl: fx.amountBrl,
      foreignTaxPaid: row.taxPaidOriginCountry?.toNumber(),
      deductionAmount: offsets.deduction,
      exemptionAmount: offsets.exemption,
      taxableAmount,
      calculatedTax: 0,
      lei14754Eligible: isLei14754Eligible(cls),
      requiresReview,
      notes: fx.notes
    });
  }
  const residencyCtx = residencyContextFromFiscal(fp?.data, taxYear);
  const lei14754Items = items.filter((it) => it.lei14754Eligible);
  const irpfExtSource = items.filter((it) => !it.lei14754Eligible);
  const irpfExtItens = irpfExtSource.map((it) => {
    const row = carnetRows.find((r) => r.id === it.incomeSourceId);
    const cls = row ? classifiedFromDbIncome(row, profile).classification : undefined;
    return classifiedIncomeToIrpfExtItem({
      id: it.incomeSourceId ?? it.incomeType,
      originCountry: it.originCountry,
      incomeType: it.incomeType,
      nature: row?.nature,
      originalCurrency: it.originalCurrency,
      grossAmount: it.originalAmount,
      paymentDate: it.paymentDate,
      taxPaidOriginCountry: it.foreignTaxPaid,
      exchangeRateToBrl: row?.exchangeRateToBrl?.toNumber() ?? (it.exchangeRate > 0 ? it.exchangeRate : undefined),
      classification: cls
    });
  });
  const aggregates = computeMonthlyViaIrpfExt001({
    residencyStart: residencyCtx.start,
    residencyEnd: residencyCtx.end,
    dependents: residencyCtx.dependents,
    age: residencyCtx.age,
    itens: irpfExtItens,
    lei14754Items,
    pack: brPack,
    ruleVersion: ruleStamp,
    sourceItems: irpfExtSource
  });
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
        totalDeductions: monthlyDeductionTotal,
        totalExemptions: monthlyExemptionTotal,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.netTaxDue,
        calculationStatus: agg.requiresAdditionalReview ? "preliminary" : "complete",
        requiresAdditionalReview: agg.requiresAdditionalReview,
        ruleVersion: agg.ruleVersion,
        jurisdiction: "BR",
        dataPackVersion: brPack.dataPackId
      },
      update: {
        totalForeignIncomeBrl: agg.taxableBaseBrl,
        totalDeductions: monthlyDeductionTotal,
        totalExemptions: monthlyExemptionTotal,
        taxableBase: agg.taxableBaseBrl,
        appliedTaxRate: agg.rate,
        grossTax: agg.grossTax,
        netTaxDue: agg.netTaxDue,
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
  taxYear: number,
  jurs: ReturnType<typeof jurisdictionsForProfile>,
  brPatches: { key: string; value: unknown }[],
  usPatches: { key: string; value: unknown }[]
): string {
  return buildRuleVersionForJurisdictions(taxYear, jurs, brPatches, usPatches);
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
  const [incomes, deductions, exemptionRows, capitalGainRows] = await Promise.all([
    db.incomeSource.findMany({ where: { userId, taxYear } }),
    db.deduction.findMany({ where: { userId, taxYear } }),
    db.exemption.findMany({ where: { userId, taxYear } }),
    db.capitalGainCalculation.findMany({ where: { userId, taxYear } })
  ]);
  const exemptions = exemptionRows.map((e) =>
    exemptionSchema.parse({
      exemptionType: e.exemptionType,
      amount: e.amount.toNumber(),
      currency: e.currency,
      amountBrl: e.amountBrl?.toNumber(),
      taxPeriod: e.taxPeriod,
      applicationScope: e.applicationScope,
      notes: e.notes ?? undefined,
      dataOrigin: e.dataOrigin
    })
  );
  const annualExemptionsBrl = sumExemptionsForScope(exemptions, "annual", "BRL");
  const capGainTaxBrl = capitalGainRows
    .filter((c) => c.jurisdiction === "BR")
    .reduce((s, c) => s + (c.taxEstimate?.toNumber() ?? 0), 0);
  const capGainTaxUsd = capitalGainRows
    .filter((c) => c.jurisdiction === "US")
    .reduce((s, c) => s + (c.taxEstimate?.toNumber() ?? 0), 0);
  const fp = await db.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  const profile = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
  const jurs = jurisdictionsForProfile(profile);
  const brPatches = await loadRulePatches("BR", taxYear);
  const usPatches = await loadRulePatches("US", taxYear);
  const brPack = getBrRulePackForYear(taxYear, brPatches);
  const usPack = getUsRulePackForYear(taxYear, usPatches);

  for (const jurisdiction of jurs) {
    if (jurisdiction === "BR") {
      let grossBrl = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const cls = classifiedFromDbIncome(row, profile).classification;
        if (!includesInOrdinaryAnnual(cls)) continue;
        const paymentDate = row.paymentDate.toISOString().slice(0, 10);
        const fx = resolveBrlFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency,
          grossAmountBrl: row.grossAmountBrl?.toNumber(),
          exchangeRateToBrl: row.exchangeRateToBrl?.toNumber(),
          paymentDate
        });
        grossBrl += fx.amountBrl;
        review ||= fx.requiresAdditionalReview;
      }
      const annualDedBrl = sumDeductionsForScope(
        deductions.map((d) => ({
          deductionType: d.deductionType,
          amount: d.amount.toNumber(),
          currency: d.currency,
          amountBrl: d.amountBrl?.toNumber(),
          taxPeriod: d.taxPeriod,
          applicationScope: d.applicationScope as "monthly" | "annual" | "transaction",
          relatedIncomeId: d.relatedIncomeId ?? undefined,
          requiresProof: d.requiresProof ?? undefined,
          proofDocumentUrl: d.proofDocumentUrl ?? undefined,
          dataOrigin: d.dataOrigin as "manual"
        })),
        "annual",
        "BRL"
      );
      let foreignBrl = 0;
      for (const row of incomes) {
        const cls = classifiedFromDbIncome(row, profile).classification;
        if (!includesInOrdinaryAnnual(cls)) continue;
        const paid = row.taxPaidOriginCountry?.toNumber() ?? 0;
        if (paid <= 0) continue;
        const converted = convertForeignTaxToBrl(
          paid,
          row.originalCurrency,
          row.paymentDate.toISOString().slice(0, 10),
          row.exchangeRateToBrl?.toNumber()
        );
        foreignBrl += converted.amountBrl;
        review ||= converted.requiresReview;
      }
      const est = buildBrAnnualEstimate({
        taxYear,
        grossIncomeBrl: grossBrl,
        deductionsTotalBrl: annualDedBrl,
        exemptionsTotalBrl: annualExemptionsBrl,
        foreignTaxPaidBrl: foreignBrl,
        requiresAdditionalReview: review,
        pack: brPack
      });
      const monthlyRows = await db.monthlyTaxCalculation.findMany({ where: { userId, taxYear } });
      const monthlyGross = monthlyRows.reduce((s, m) => s + m.taxableBase.toNumber(), 0);
      const monthlyNet = monthlyRows.reduce((s, m) => s + m.netTaxDue.toNumber(), 0);
      const monthlyTax = monthlyRows.reduce((s, m) => s + m.grossTax.toNumber(), 0);
      review ||= monthlyRows.some((m) => m.requiresAdditionalReview);
      const mergedNetDue = est.netTaxDue + capGainTaxBrl + monthlyNet;
      const mergedGrossTax = est.grossTax + capGainTaxBrl + monthlyTax;
      const mergedGrossIncome = est.grossIncome + monthlyGross;
      const mergedTaxableBase = est.taxableBase + monthlyGross;
      const ruleVersion = buildStampWithOverrides(brPack.dataPackId, brPatches);
      await db.taxCalculation.create({
        data: {
          userId,
          taxYear: est.taxYear,
          calculationType: est.calculationType,
          grossIncome: mergedGrossIncome,
          deductionsTotal: est.deductionsTotal,
          exemptionsTotal: est.exemptionsTotal,
          taxableBase: mergedTaxableBase,
          appliedRate: est.appliedRate,
          grossTax: mergedGrossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: mergedNetDue,
          currency: est.currency,
          calculationStatus: review || est.requiresAdditionalReview ? "preliminary" : est.calculationStatus,
          requiresAdditionalReview: review || est.requiresAdditionalReview,
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
      let passiveIncomeUsd = 0;
      let generalIncomeUsd = 0;
      let passiveForeignTaxUsd = 0;
      let generalForeignTaxUsd = 0;
      let review = fp?.requiresAdditionalReview ?? false;
      for (const row of incomes) {
        const cls = classifiedFromDbIncome(row, profile).classification;
        if (!includesInUsOrdinaryAnnual(cls)) continue;
        const paymentDate = row.paymentDate.toISOString().slice(0, 10);
        const fx = resolveUsdFromIncome({
          grossAmount: row.grossAmount.toNumber(),
          originalCurrency: row.originalCurrency,
          paymentDate,
          grossAmountBrl: row.grossAmountBrl?.toNumber(),
          exchangeRateToBrl: row.exchangeRateToBrl?.toNumber()
        });
        grossUsd += fx.amountUsd;
        review ||= fx.requiresAdditionalReview;
        const basket = cls?.ftcBasket ?? "general";
        if (basket === "passive") passiveIncomeUsd += fx.amountUsd;
        else generalIncomeUsd += fx.amountUsd;
        const paid = row.taxPaidOriginCountry?.toNumber() ?? 0;
        if (paid > 0) {
          const converted = convertForeignTaxToUsd(paid, row.originalCurrency, paymentDate);
          review ||= converted.requiresReview;
          if (basket === "passive") passiveForeignTaxUsd += converted.amountUsd;
          else generalForeignTaxUsd += converted.amountUsd;
        }
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
      const foreignUsd = passiveForeignTaxUsd + generalForeignTaxUsd;
      const annualExemptionsUsd = sumExemptionsForScope(exemptions, "annual", "USD");
      const est = buildUsAnnualEstimate({
        taxYear,
        grossIncomeUsd: grossUsd,
        deductionsUsd: dedUsd,
        exemptionsUsd: annualExemptionsUsd,
        foreignTaxPaidUsd: foreignUsd,
        passiveIncomeUsd,
        generalIncomeUsd,
        passiveForeignTaxPaidUsd: passiveForeignTaxUsd,
        generalForeignTaxPaidUsd: generalForeignTaxUsd,
        foreignEarnedIncomeUsd: usFiling?.foreignEarnedIncomeUsd ?? 0,
        netInvestmentIncomeUsd: usFiling?.netInvestmentIncomeUsd ?? 0,
        filingStatus: usFiling?.filingStatus ?? "single",
        requiresAdditionalReview: review,
        pack: usPack
      });
      const mergedNetDue = est.netTaxDue + capGainTaxUsd;
      const mergedGrossTax = est.grossTax + capGainTaxUsd;
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
          grossTax: mergedGrossTax,
          foreignTaxPaid: est.foreignTaxPaid ?? null,
          taxCreditApplied: est.taxCreditApplied ?? null,
          netTaxDue: mergedNetDue,
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

async function loadUsFilingInputsForUser(
  userId: string,
  taxYear: number,
  tx?: Prisma.TransactionClient
): Promise<UsFilingInputsForEstimate | undefined> {
  const db = dbClient(tx);
  const session = await db.conversationSession.findFirst({
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
    await syncTaxableEvents(userId, taxYear, tx);
    await recomputeMonthlyTax(userId, taxYear, tx);
    const usFiling = await loadUsFilingInputsForUser(userId, taxYear, tx);
    await estimateAnnualTax(userId, taxYear, tx, usFiling);

    const fp = await tx.fiscalResidenceProfile.findUnique({
      where: { userId_taxYear: { userId, taxYear } }
    });
    const [incomes, events, deductions, exemptions, monthly, capitalGains, assets, transfers, trusts, entitySims] =
      await Promise.all([
        tx.incomeSource.findMany({ where: { userId, taxYear } }),
        tx.taxableEvent.findMany({ where: { userId, taxYear } }),
        tx.deduction.findMany({ where: { userId, taxYear } }),
        tx.exemption.findMany({ where: { userId, taxYear } }),
        tx.monthlyTaxCalculation.findMany({ where: { userId, taxYear } }),
        tx.capitalGainCalculation.findMany({ where: { userId, taxYear } }),
        tx.asset.findMany({ where: { userId, taxYear } }),
        tx.internationalTransfer.findMany({ where: { userId, taxYear } }),
        tx.trustStructure.findMany({ where: { userId, taxYear } }),
        tx.entitySimulation.findMany({ where: { userId, taxYear } })
      ]);
    const requiresAdditionalReview =
      (fp?.requiresAdditionalReview ?? false) ||
      events.some((e) => e.requiresReview) ||
      monthly.some((m) => m.requiresAdditionalReview) ||
      assets.some((a) => a.requiresReview) ||
      transfers.some((t) => t.requiresReview) ||
      trusts.some((t) => t.requiresReview) ||
      entitySims.some((s) => s.requiresReview);

    const prof = (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
    const jurs = jurisdictionsForProfile(prof);
    const brPatches = await loadRulePatches("BR", taxYear);
    const usPatches = await loadRulePatches("US", taxYear);
    const reportRuleVersion = buildReportRuleVersion(taxYear, jurs, brPatches, usPatches);
    const reportJurisdiction = jurs.includes("BR") && jurs.includes("US") ? "BR+US" : jurs.includes("US") ? "US" : "BR";

    const annualTaxEstimates = await getLatestTaxCalculationSnapshot(userId, taxYear, tx);
    const unconvertedIncome = incomes
      .filter((row) => {
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
        return brl.requiresAdditionalReview || usd.requiresAdditionalReview;
      })
      .map((row) => ({
        amount: row.grossAmount.toNumber(),
        currency: row.originalCurrency,
        payerName: row.payerName
      }));

    const summary = buildTaxReportSummary({
      taxYear,
      fiscalProfile: fp?.derivedProfile ?? "unknown",
      incomes,
      events,
      deductions,
      exemptions,
      monthly,
      capitalGains,
      assets,
      transfers,
      trusts: trusts,
      entitySimulations: entitySims,
      annualTaxEstimates,
      unconvertedIncome,
      requiresAdditionalReview,
      ruleVersion: reportRuleVersion
    });

    await tx.taxReport.updateMany({
      where: { userId, taxYear, isStale: false },
      data: { isStale: true }
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
        dataPackVersion: reportRuleVersion,
        isStale: false,
        sections: {
          create: summary.sections.map((s) => ({
            title: s.title,
            bodyMarkdown: s.bodyMarkdown ?? null,
            payload: (s.payload ?? {}) as Prisma.InputJsonValue,
            sortOrder: s.sortOrder,
            items: s.items
              ? {
                  create: s.items.map((it) => ({
                    label: it.label,
                    valueJson: it.valueJson as Prisma.InputJsonValue
                  }))
                }
              : undefined
          }))
        }
      }
    });
    return report.id;
  });
}
