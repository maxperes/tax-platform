import { validateDeductionForMvp } from "@tax-platform/rules";
import type { Deduction } from "@tax-platform/shared";
import type { Deduction as DeductionRow } from "@prisma/client";
import { prisma } from "../../db.js";

type CreateDeductionResult =
  | { ok: true; row: DeductionRow }
  | { ok: false; errors: string[] };

export async function createDeduction(
  userId: string,
  taxYear: number,
  deduction: Deduction
): Promise<CreateDeductionResult> {
  const v = validateDeductionForMvp(deduction);
  if (!v.ok) {
    return { ok: false, errors: v.errors };
  }
  const row = await prisma.deduction.create({
    data: {
      userId,
      taxYear,
      deductionType: deduction.deductionType,
      relatedIncomeId: deduction.relatedIncomeId ?? null,
      relatedEventId: deduction.relatedEventId ?? null,
      relatedAssetId: deduction.relatedAssetId ?? null,
      amount: deduction.amount,
      currency: deduction.currency,
      exchangeRate: deduction.exchangeRate ?? null,
      amountBrl: deduction.amountBrl ?? null,
      taxPeriod: deduction.taxPeriod,
      applicationScope: deduction.applicationScope,
      isRecurring: deduction.isRecurring ?? null,
      isEligible: deduction.isEligible ?? null,
      requiresProof: deduction.requiresProof ?? null,
      proofDocumentUrl: deduction.proofDocumentUrl ?? null,
      notes: deduction.notes ?? null
    }
  });
  return { ok: true, row };
}
