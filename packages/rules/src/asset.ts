import type { AssetInput } from "@tax-platform/shared";

export type AssetAssessment = {
  name: string;
  isForeignAsset: boolean;
  requiresReview: boolean;
  estimatedGain?: number;
};

/** RF-007: assess registered asset for patrimony disclosure and capital-gain linkage. */
export function assessAsset(input: AssetInput): AssetAssessment {
  const isForeign = input.isForeignAsset ?? input.country !== "BR";
  const hasCurrent = input.currentValue != null;
  let estimatedGain: number | undefined;
  if (hasCurrent && input.currentValue! > input.acquisitionValue) {
    estimatedGain = input.currentValue! - input.acquisitionValue;
  }
  const complexType = /trust|offshore|crypto|fund/i.test(input.assetType);
  return {
    name: input.name,
    isForeignAsset: isForeign,
    requiresReview: isForeign || complexType,
    estimatedGain
  };
}
