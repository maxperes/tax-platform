import { assessTrustStructure } from "@tax-platform/rules";
import type { TrustStructureInput } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import { logDataChange } from "./data-change-log.js";

export async function createTrustStructure(userId: string, taxYear: number, trust: TrustStructureInput) {
  const assessment = assessTrustStructure(trust);
  const row = await prisma.trustStructure.create({
    data: {
      userId,
      taxYear,
      name: trust.name,
      jurisdiction: trust.jurisdiction,
      trustType: trust.trustType,
      settlorName: trust.settlorName ?? null,
      beneficiaryNames: trust.beneficiaryNames ?? undefined,
      isGrantorTrust: trust.isGrantorTrust ?? null,
      annualDistributionsUsd: trust.annualDistributionsUsd ?? null,
      isTaxable: assessment.isTaxable,
      requiresReview: assessment.requiresReview,
      notes: trust.notes ?? null,
      dataOrigin: trust.dataOrigin ?? "manual"
    }
  });
  await logDataChange(userId, taxYear, "TrustStructure", row.id, "create", undefined, row);
  return { row, assessment };
}

export async function listTrustStructures(userId: string, taxYear: number) {
  return prisma.trustStructure.findMany({ where: { userId, taxYear }, orderBy: { createdAt: "desc" } });
}
