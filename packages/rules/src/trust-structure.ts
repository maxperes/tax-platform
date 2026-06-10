import type { TrustStructureInput, TrustType } from "@tax-platform/shared";

export type TrustAssessment = {
  trustType: TrustType;
  isTaxable: boolean;
  requiresReview: boolean;
  taxTreatment: string;
};

/** RF-009/010: revocable trusts taxable; irrevocable may be non-taxable but flagged for review. */
export function assessTrustStructure(input: TrustStructureInput): TrustAssessment {
  if (input.trustType === "revocable") {
    return {
      trustType: input.trustType,
      isTaxable: true,
      requiresReview: true,
      taxTreatment: "Revocable trust — grantor taxed on income; specialist review recommended"
    };
  }
  if (input.trustType === "irrevocable") {
    return {
      trustType: input.trustType,
      isTaxable: false,
      requiresReview: true,
      taxTreatment: "Irrevocable trust — distributions may be non-taxable to grantor; confirm with specialist"
    };
  }
  return {
    trustType: input.trustType,
    isTaxable: false,
    requiresReview: true,
    taxTreatment: "Trust type unknown — requires classification"
  };
}
