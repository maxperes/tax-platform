import { prisma } from "../../db.js";

export async function logDataChange(
  userId: string,
  taxYear: number,
  entityType: string,
  entityId: string,
  changeType: "create" | "update" | "delete",
  beforeJson?: unknown,
  afterJson?: unknown
): Promise<void> {
  await prisma.dataChangeLog.create({
    data: {
      userId,
      taxYear,
      entityType,
      entityId,
      changeType,
      beforeJson: beforeJson != null ? (beforeJson as object) : undefined,
      afterJson: afterJson != null ? (afterJson as object) : undefined
    }
  });
  await prisma.taxReport.updateMany({
    where: { userId, taxYear, isStale: false },
    data: { isStale: true }
  });
}

export async function getDataChangeHistory(
  userId: string,
  taxYear: number,
  limit = 50
): Promise<unknown[]> {
  return prisma.dataChangeLog.findMany({
    where: { userId, taxYear },
    orderBy: { occurredAt: "desc" },
    take: limit
  });
}
