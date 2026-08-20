import { z } from "zod";

export const userPlanSchema = z.enum(["basic", "pro"]);
export type UserPlan = z.infer<typeof userPlanSchema>;

export const brazilEntryPathwaySchema = z.enum([
  "temporary_visa",
  "permanent_visa",
  "digital_nomad",
  "returning_brazilian",
  "expatriate_brazilian",
  "marriage",
  "family_reunification",
  "other",
  "unknown"
]);

export type BrazilEntryPathway = z.infer<typeof brazilEntryPathwaySchema>;

/** Inclusive presence interval in Brazil. Omit exitDate when the stay is still open. */
export const brazilStaySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export type BrazilStay = z.infer<typeof brazilStaySchema>;

export const twinPersonRoleSchema = z.enum([
  "primary",
  "spouse",
  "partner",
  "child",
  "dependent",
  "parent",
  "other"
]);

export const twinPersonSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().min(1),
  role: twinPersonRoleSchema,
  livesInCountry: z.string().min(2).optional(),
  worksInCountry: z.string().min(2).optional(),
  hasIncome: z.boolean().optional(),
  hasWealth: z.boolean().optional(),
  hasInvestments: z.boolean().optional(),
  notes: z.string().optional()
});

export type TwinPersonInput = z.infer<typeof twinPersonSchema>;

export const countryFootprintSchema = z.object({
  country: z.string().min(2),
  hasTaxResidency: z.boolean().optional(),
  hasCitizenship: z.boolean().optional(),
  hasGreenCard: z.boolean().optional(),
  hasPermanentVisa: z.boolean().optional(),
  hasDomicile: z.boolean().optional(),
  hasCompany: z.boolean().optional(),
  hasInvestments: z.boolean().optional(),
  hasRealEstate: z.boolean().optional(),
  hasRetirementIncome: z.boolean().optional()
});

export type CountryFootprint = z.infer<typeof countryFootprintSchema>;

export const twinResidencyFactsSchema = z.object({
  firstEntryBrazilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entryPathway: brazilEntryPathwaySchema.optional(),
  rnmNumber: z.string().optional(),
  daysInBrazilCalendarYear: z.number().int().min(0).max(366).optional(),
  /** Day-level entry/exit history for BR-RESID-001 rolling 183-day test. */
  brazilStays: z.array(brazilStaySchema).optional(),
  /** Whether the person is physically in Brazil today (from interview or copilot). */
  physicallyLivesInBrazil: z.boolean().optional(),
  priorPermanentExitBrazil: z.boolean().optional(),
  priorPermanentExitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currentlyFiscalResidentBrazil: z.boolean().optional(),
  currentlyFiscalResidentUSA: z.boolean().optional(),
  otherFiscalResidencies: z.array(z.string()).optional(),
  /** ISO country claimed as foreign tax residence (substance probe; not a holding). */
  claimedForeignResidencyCountry: z.string().min(2).optional(),
  hasElectoralDomicileBrazil: z.boolean().optional(),
  filesDirpfWithBrazilAddress: z.boolean().optional(),
  maintainsBrazilBankAccounts: z.boolean().optional(),
  acquiredBrazilRealEstateAfterClaimedExit: z.boolean().optional(),
  /** Legacy interview field; no longer collected. Kept for older Twin records. */
  intendsToRemain: z.enum(["yes", "temporarily", "no"]).optional()
});

export type TwinResidencyFacts = z.infer<typeof twinResidencyFactsSchema>;

export const brazilianTaxTreatmentSchema = z.enum([
  "salary_progressive",
  "llc_pass_through",
  "llc_distribution",
  "capital_gain",
  "lei_14754_offshore",
  "definitive_withholding",
  "reporting_only",
  "unknown"
]);

export type BrazilianTaxTreatment = z.infer<typeof brazilianTaxTreatmentSchema>;

export const twinIncomeLineSchema = z.object({
  category: z.string().min(1),
  payerName: z.string().optional(),
  originCountry: z.string().min(2),
  periodicity: z.enum(["monthly", "annual", "one_off", "recurring"]).optional(),
  currency: z.string().length(3),
  annualAmount: z.number().nonnegative(),
  taxPaidOrigin: z.number().nonnegative().optional(),
  withholdingTax: z.number().nonnegative().optional(),
  /** Availability / payment date — drives split-year vs residency start. */
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Structured Brazilian tax treatment; To Be prefers this over category heuristics. */
  brazilianTaxTreatment: brazilianTaxTreatmentSchema.optional(),
  notes: z.string().optional()
});

export type TwinIncomeLine = z.infer<typeof twinIncomeLineSchema>;

export const twinAssetLineSchema = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1),
  country: z.string().min(2),
  currentValue: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional()
});

export type TwinAssetLine = z.infer<typeof twinAssetLineSchema>;

export const twinEntityLineSchema = z.object({
  name: z.string().min(1),
  entityType: z.string().min(1),
  country: z.string().min(2),
  ownershipPercent: z.number().min(0).max(100).optional(),
  controls: z.boolean().optional(),
  notes: z.string().optional()
});

export type TwinEntityLine = z.infer<typeof twinEntityLineSchema>;

export const twinTrustLineSchema = z.object({
  name: z.string().min(1),
  jurisdiction: z.string().min(2),
  trustType: z.enum(["revocable", "irrevocable", "other"]).optional(),
  isGrantorTrust: z.boolean().optional(),
  notes: z.string().optional()
});

export type TwinTrustLine = z.infer<typeof twinTrustLineSchema>;

/** Structured As Is inventory stored on TwinCase.inventoryJson */
export const twinInventorySchema = z.object({
  residency: twinResidencyFactsSchema.default({}),
  countryFootprint: z.array(countryFootprintSchema).default([]),
  incomes: z.array(twinIncomeLineSchema).default([]),
  assets: z.array(twinAssetLineSchema).default([]),
  entities: z.array(twinEntityLineSchema).default([]),
  trusts: z.array(twinTrustLineSchema).default([]),
  financialAccountsSummary: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export type TwinInventory = z.infer<typeof twinInventorySchema>;

export const twinCaseUpsertSchema = z.object({
  taxYear: z.number().int(),
  title: z.string().min(1).optional(),
  inventory: twinInventorySchema.optional(),
  persons: z.array(twinPersonSchema).optional(),
  interview: z.record(z.string(), z.unknown()).optional()
});

export type TwinCaseUpsert = z.infer<typeof twinCaseUpsertSchema>;

export const AS_IS_COMPLETION_MODULES = [
  "residency",
  "countries",
  "family",
  "incomes",
  "assets",
  "entities",
  "trusts",
  "accounts"
] as const;

export type AsIsCompletionModule = (typeof AS_IS_COMPLETION_MODULES)[number];
