import { classifyIncome } from "@tax-platform/rules";
import type { FiscalProfile, IncomeSource } from "@tax-platform/shared";
import type { IncomeSource as IncomeSourceRow, Prisma } from "@prisma/client";

type ClassifiedIncome = IncomeSource & { classification: NonNullable<IncomeSource["classification"]> };
import { prisma } from "../../db.js";

export async function getFiscalProfile(userId: string, taxYear: number): Promise<FiscalProfile> {
  const fp = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear } }
  });
  return (fp?.derivedProfile ?? "undetermined") as FiscalProfile;
}

export function classifiedIncomeCreateData(
  userId: string,
  taxYear: number,
  classified: ClassifiedIncome
) {
  return {
    userId,
    taxYear,
    payerName: classified.payerName,
    originCountry: classified.originCountry,
    incomeType: classified.incomeType,
    grossAmount: classified.grossAmount,
    originalCurrency: classified.originalCurrency,
    paymentDate: new Date(classified.paymentDate),
    periodicity: classified.periodicity,
    taxPaidOriginCountry: classified.taxPaidOriginCountry ?? null,
    withholdingTax: classified.withholdingTax ?? null,
    hasProofDocument: classified.hasProofDocument ?? null,
    destinationAccountHint: classified.destinationAccountHint ?? null,
    transferredToBrazil: classified.transferredToBrazil ?? null,
    remainedAbroad: classified.remainedAbroad ?? null,
    nature: classified.nature,
    notes: classified.notes ?? null,
    exchangeRateToBrl: classified.exchangeRateToBrl ?? null,
    grossAmountBrl: classified.grossAmountBrl ?? null,
    classification: classified.classification as Prisma.InputJsonValue
  };
}

export function classifiedIncomeUpdateData(userId: string, taxYear: number, classified: ClassifiedIncome) {
  const { userId: _u, taxYear: _y, ...updateData } = classifiedIncomeCreateData(
    userId,
    taxYear,
    classified
  );
  void _u;
  void _y;
  return updateData;
}

export async function createClassifiedIncome(
  userId: string,
  taxYear: number,
  income: IncomeSource
): Promise<IncomeSourceRow> {
  const profile = await getFiscalProfile(userId, taxYear);
  const classified = classifyIncome(income, profile);
  return prisma.incomeSource.create({
    data: classifiedIncomeCreateData(userId, taxYear, classified)
  });
}
