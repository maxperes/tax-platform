import {
  fiscalResidenceSchema,
  interviewToTwin,
  mergeInterviewRecords,
  parseInterviewRecord,
  sessionFactsToInterviewRecord
} from "@tax-platform/shared";
import { prisma } from "../db.js";
import { upsertTwinCase, getOrCreateTwinCase } from "./twin.js";

function mapClassification(classification: unknown): string | undefined {
  if (!classification || typeof classification !== "object") return undefined;
  const row = classification as {
    calculationModule?: string;
    lei14754ForeignProfitsEligible?: boolean;
  };
  if (row.lei14754ForeignProfitsEligible) return "llc_distribution";
  if (row.calculationModule === "trust_offshore") return "lei_14754_offshore";
  if (row.calculationModule === "capital_gain") return "capital_gain";
  if (row.calculationModule === "carnet_leao" || row.calculationModule === "irpf") {
    return "salary_progressive";
  }
  return undefined;
}

export type SyncSessionToTwinResult = {
  twinId: string;
  taxYear: number;
  answerCount: number;
  projectedKeys: string[];
  assessmentComplete: boolean;
};

export async function syncSessionToTwin(
  userId: string,
  sessionId: string
): Promise<SyncSessionToTwinResult | null> {
  const session = await prisma.conversationSession.findFirst({
    where: { id: sessionId, userId }
  });
  if (!session) return null;

  const [fiscalRow, incomes, assets, trusts, existingTwin] = await Promise.all([
    prisma.fiscalResidenceProfile.findUnique({
      where: { userId_taxYear: { userId, taxYear: session.taxYear } }
    }),
    prisma.incomeSource.findMany({ where: { userId, taxYear: session.taxYear } }),
    prisma.asset.findMany({ where: { userId, taxYear: session.taxYear } }),
    prisma.trustStructure.findMany({ where: { userId, taxYear: session.taxYear } }),
    prisma.twinCase.findUnique({
      where: { userId_taxYear: { userId, taxYear: session.taxYear } }
    })
  ]);

  const fiscalParsed = fiscalRow?.data
    ? fiscalResidenceSchema.safeParse(fiscalRow.data)
    : null;
  const fiscal = fiscalParsed?.success ? fiscalParsed.data : null;

  const toNumber = (value: { toNumber?: () => number } | number | null | undefined) => {
    if (value == null) return undefined;
    if (typeof value === "number") return value;
    if (typeof value.toNumber === "function") return value.toNumber();
    return Number(value);
  };

  const sessionCtx =
    session.contextJson && typeof session.contextJson === "object" && !Array.isArray(session.contextJson)
      ? (session.contextJson as Record<string, unknown>)
      : {};
  const assetTypeHints = Array.isArray(sessionCtx.assetTypes)
    ? sessionCtx.assetTypes.filter((value): value is string => typeof value === "string")
    : [];

  const projected = sessionFactsToInterviewRecord({
    fiscal,
    assetTypeHints,
    incomes: incomes.map((row) => ({
      incomeType: row.incomeType,
      nature: row.nature as
        | "work"
        | "investment"
        | "retirement"
        | "asset"
        | "corporate"
        | "trust"
        | "other",
      originCountry: row.originCountry,
      grossAmount: toNumber(row.grossAmount) ?? 0,
      originalCurrency: row.originalCurrency,
      periodicity: row.periodicity as "monthly" | "annual" | "one_off" | "recurring",
      taxPaidOriginCountry: toNumber(row.taxPaidOriginCountry),
      withholdingTax: toNumber(row.withholdingTax),
      paymentDate: row.paymentDate.toISOString().slice(0, 10),
      brazilianTaxTreatment:
        row.classification && typeof row.classification === "object"
          ? mapClassification(row.classification)
          : undefined
    })),
    assets: assets.map((row) => ({
      assetType: row.assetType,
      country: row.country
    })),
    trusts: trusts.map((row) => ({
      name: row.name,
      jurisdiction: row.jurisdiction
    }))
  });

  if (Object.keys(projected.answers).length === 0) {
    const twin = existingTwin ?? (await getOrCreateTwinCase(userId, session.taxYear));
    return {
      twinId: twin.id,
      taxYear: session.taxYear,
      answerCount: 0,
      projectedKeys: [],
      assessmentComplete: false
    };
  }

  const existingInterview = parseInterviewRecord(existingTwin?.interviewJson);
  const merged = mergeInterviewRecords(existingInterview, projected);
  const { inventory, persons } = interviewToTwin(merged);

  const twin = await upsertTwinCase(userId, {
    taxYear: session.taxYear,
    inventory,
    persons,
    interview: merged as unknown as Record<string, unknown>
  });

  return {
    twinId: twin.id,
    taxYear: session.taxYear,
    answerCount: Object.keys(merged.answers).length,
    projectedKeys: merged.meta?.projectedKeys ?? [],
    assessmentComplete: merged.assessmentComplete
  };
}
