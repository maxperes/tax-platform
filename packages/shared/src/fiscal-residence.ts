import { z } from "zod";

export const fiscalResidenceSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  nationalityCountry: z.string().min(2),
  currentResidenceCountry: z.string().min(2),
  cpf: z.string().optional(),
  foreignTaxId: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primaryCurrency: z.string().min(3).max(3),

  isFiscalResidentBrazil: z.boolean(),
  isFiscalResidentUSA: z.boolean(),
  fiscalResidenceOtherCountry: z.boolean(),
  fiscalResidenceBrazilStartDate: z.string().optional(),
  fiscalResidenceBrazilEndDate: z.string().optional(),
  declaredPermanentExitBrazil: z.boolean().optional(),
  physicallyLivesInBrazil: z.boolean().optional(),
  daysInBrazilCalendarYear: z.number().int().min(0).max(366).optional(),
  daysInUSACalendarYear: z.number().int().min(0).max(366).optional(),
  hasGreenCard: z.boolean().optional(),
  hasUSCitizenship: z.boolean().optional(),
  hasUSWorkVisa: z.boolean().optional(),
  hasPermanentAddressBrazil: z.boolean().optional(),
  hasPermanentAddressUSA: z.boolean().optional(),
  hasDependentsBrazilOrAbroad: z.boolean().optional(),

  /** Map-aligned life facts collected by copilot (optional; interview path stores these on interviewJson). */
  firstEntryBrazilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  immigrationStatus: z
    .enum([
      "tourist",
      "temporary_visa",
      "digital_nomad",
      "work_visa",
      "retirement_visa",
      "family_reunion",
      "permanent",
      "citizen",
      "none"
    ])
    .optional(),
  hasCpf: z.boolean().optional(),
  hasResidencePermit: z.boolean().optional(),
  intendsToRemain: z.enum(["yes", "temporarily", "no"]).optional(),
  lastFilingCountry: z.string().min(2).optional(),
  filedBrazilianReturn: z.boolean().optional(),
  maritalStatus: z.enum(["single", "married", "stable_union", "divorced", "widowed"]).optional(),
  dependentsCount: z.number().int().min(0).max(30).optional()
});

export type FiscalResidence = z.infer<typeof fiscalResidenceSchema>;

export const fiscalProfileSchema = z.enum([
  "resident_brazil",
  "non_resident_brazil",
  "resident_usa",
  "dual_residence",
  "undetermined"
]);

export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;
