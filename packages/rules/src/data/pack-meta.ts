/** Metadata for SME governance and release tracking (not used in calculations). */
export type DataPackMeta = {
  taxYear: number;
  dataPackId: string;
  jurisdiction: "BR" | "US";
  /** Official or reference URLs used when populating the pack. */
  sources: string[];
  /** Must be cleared by SME sign-off before production. */
  smeReviewRequired: boolean;
  /** ISO date when SME last validated tables (YYYY-MM-DD). */
  lastValidatedAt: string | null;
  /** Reviewer identifier (name or ticket id). */
  validatedBy: string | null;
  notes?: string;
};
