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
  hasDependentsBrazilOrAbroad: z.boolean().optional()
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
