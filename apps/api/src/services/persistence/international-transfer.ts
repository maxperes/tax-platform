import { assessInternationalTransfer } from "@tax-platform/rules";
import type { InternationalTransferInput } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import { logDataChange } from "./data-change-log.js";

export async function createInternationalTransfer(
  userId: string,
  taxYear: number,
  transfer: InternationalTransferInput
) {
  const assessment = assessInternationalTransfer(transfer);
  const row = await prisma.internationalTransfer.create({
    data: {
      userId,
      taxYear,
      fromCountry: transfer.fromCountry,
      toCountry: transfer.toCountry,
      amount: transfer.amount,
      currency: transfer.currency,
      transferDate: new Date(transfer.transferDate),
      classification: transfer.classification,
      isTaxable: assessment.isTaxable,
      requiresReview: assessment.requiresReview,
      relatedIncomeId: transfer.relatedIncomeId ?? null,
      relatedTrustId: transfer.relatedTrustId ?? null,
      notes: transfer.notes ?? null,
      dataOrigin: transfer.dataOrigin ?? "manual"
    }
  });
  await logDataChange(userId, taxYear, "InternationalTransfer", row.id, "create", undefined, row);
  return { row, assessment };
}

export async function listInternationalTransfers(userId: string, taxYear: number) {
  return prisma.internationalTransfer.findMany({
    where: { userId, taxYear },
    orderBy: { transferDate: "desc" }
  });
}
