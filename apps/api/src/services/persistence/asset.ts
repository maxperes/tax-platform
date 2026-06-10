import { assessAsset } from "@tax-platform/rules";
import type { AssetInput } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import { logDataChange } from "./data-change-log.js";

export async function createAsset(userId: string, taxYear: number, asset: AssetInput) {
  const assessment = assessAsset(asset);
  const row = await prisma.asset.create({
    data: {
      userId,
      taxYear,
      name: asset.name,
      assetType: asset.assetType,
      country: asset.country,
      acquisitionDate: new Date(asset.acquisitionDate),
      acquisitionValue: asset.acquisitionValue,
      acquisitionCurrency: asset.acquisitionCurrency,
      currentValue: asset.currentValue ?? null,
      currentCurrency: asset.currentCurrency ?? null,
      isForeignAsset: assessment.isForeignAsset,
      requiresReview: assessment.requiresReview,
      notes: asset.notes ?? null,
      dataOrigin: asset.dataOrigin ?? "manual"
    }
  });
  await logDataChange(userId, taxYear, "Asset", row.id, "create", undefined, row);
  return { row, assessment };
}

export async function listAssets(userId: string, taxYear: number) {
  return prisma.asset.findMany({ where: { userId, taxYear }, orderBy: { createdAt: "desc" } });
}
