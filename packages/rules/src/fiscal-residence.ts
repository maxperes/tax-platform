import type { FiscalResidence, FiscalProfile } from "@tax-platform/shared";

/**
 * RN-001 to RN-004: derive initial fiscal profile from RF-001 answers.
 */
export function deriveFiscalProfile(input: FiscalResidence): {
  profile: FiscalProfile;
  requiresAdditionalReview: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  let requiresAdditionalReview = false;

  const br = input.isFiscalResidentBrazil;
  const us = input.isFiscalResidentUSA;
  const other = input.fiscalResidenceOtherCountry;

  if (br && us) {
    requiresAdditionalReview = true;
    reasons.push("Dual fiscal residence indicated (Brazil and USA).");
    return { profile: "dual_residence", requiresAdditionalReview, reasons };
  }

  if ((br || us) && other) {
    requiresAdditionalReview = true;
    reasons.push("Fiscal residence in more than two jurisdictions indicated.");
    return { profile: "dual_residence", requiresAdditionalReview, reasons };
  }

  if (input.declaredPermanentExitBrazil && input.fiscalResidenceBrazilEndDate) {
    reasons.push("Permanent exit from Brazil declared; treat as potential non-resident from end date.");
  }

  if (br && !us) {
    return { profile: "resident_brazil", requiresAdditionalReview, reasons };
  }
  if (!br && us) {
    return { profile: "resident_usa", requiresAdditionalReview, reasons };
  }
  if (!br && !us && !other) {
    return { profile: "undetermined", requiresAdditionalReview: true, reasons: ["Residence unclear."] };
  }
  if (!br && !us && other) {
    requiresAdditionalReview = true;
    reasons.push("Resident abroad; Brazilian connection must be evaluated per income/assets.");
    return { profile: "non_resident_brazil", requiresAdditionalReview, reasons };
  }

  return { profile: "undetermined", requiresAdditionalReview: true, reasons: ["Unable to classify from inputs."] };
}
