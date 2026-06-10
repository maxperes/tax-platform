import type { Exemption } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import { logDataChange } from "./data-change-log.js";

export async function createExemption(userId: string, taxYear: number, exemption: Exemption) {
  const row = await prisma.exemption.create({
    data: {
      userId,
      taxYear,
      exemptionType: exemption.exemptionType,
      amount: exemption.amount,
      currency: exemption.currency,
      amountBrl: exemption.amountBrl ?? null,
      taxPeriod: exemption.taxPeriod,
      applicationScope: exemption.applicationScope,
      notes: exemption.notes ?? null,
      dataOrigin: exemption.dataOrigin ?? "manual"
    }
  });
  await logDataChange(userId, taxYear, "Exemption", row.id, "create", undefined, row);
  return { row };
}

export async function listExemptions(userId: string, taxYear: number) {
  return prisma.exemption.findMany({ where: { userId, taxYear }, orderBy: { createdAt: "desc" } });
}
