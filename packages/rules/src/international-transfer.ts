import type { InternationalTransferInput, TransferClassification } from "@tax-platform/shared";

export type TransferAssessment = {
  classification: TransferClassification;
  isTaxable: boolean;
  requiresReview: boolean;
  description: string;
};

/** RF-008: classify international transfers; own-account moves are not taxable events. */
export function assessInternationalTransfer(input: InternationalTransferInput): TransferAssessment {
  const cls = input.classification;
  if (cls === "own_account") {
    return {
      classification: cls,
      isTaxable: false,
      requiresReview: false,
      description: `Own-account transfer ${input.fromCountry} → ${input.toCountry} (non-taxable)`
    };
  }
  if (cls === "income_receipt") {
    return {
      classification: cls,
      isTaxable: true,
      requiresReview: false,
      description: `Income receipt transfer ${input.fromCountry} → ${input.toCountry}`
    };
  }
  if (cls === "trust_distribution") {
    return {
      classification: cls,
      isTaxable: false,
      requiresReview: true,
      description: `Trust distribution transfer — requires specialist review`
    };
  }
  return {
    classification: cls,
    isTaxable: cls === "gift" || cls === "loan",
    requiresReview: cls === "unknown" || cls === "gift",
    description: `International transfer (${cls}) ${input.fromCountry} → ${input.toCountry}`
  };
}
