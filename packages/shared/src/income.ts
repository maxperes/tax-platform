import { z } from "zod";

export const incomeNatureSchema = z.enum([
  "work",
  "investment",
  "retirement",
  "asset",
  "corporate",
  "trust",
  "other"
]);

export const incomeClassificationSchema = z.object({
  origin: z.enum(["brazil", "foreign", "mixed", "unknown"]),
  nature: z.string().min(1),
  taxTreatment: z.enum([
    "taxable",
    "exempt",
    "non_taxable",
    "partially_taxable",
    "foreign_tax_credit",
    "pending",
    "complex"
  ]),
  calculationModule: z.enum([
    "irpf",
    "carnet_leao",
    "capital_gain",
    "foreign_credit",
    "trust_offshore",
    "asset_simulation",
    "entity_simulation"
  ]),
  /** Lei 14.754/2023 style foreign profits regime (BR); SME must confirm eligibility. */
  lei14754ForeignProfitsEligible: z.boolean().optional(),
  /** US Form 1116 passive vs general basket (simplified). */
  ftcBasket: z.enum(["passive", "general"]).optional()
});

export const incomeSourceSchema = z.object({
  payerName: z.string().min(1),
  originCountry: z.string().min(2),
  incomeType: z.string().min(1),
  grossAmount: z.number().nonnegative(),
  originalCurrency: z.string().length(3),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodicity: z.enum(["monthly", "annual", "one_off", "recurring"]),
  taxPaidOriginCountry: z.number().nonnegative().optional(),
  withholdingTax: z.number().nonnegative().optional(),
  hasProofDocument: z.boolean().optional(),
  destinationAccountHint: z.string().optional(),
  transferredToBrazil: z.boolean().optional(),
  remainedAbroad: z.boolean().optional(),
  nature: incomeNatureSchema,
  notes: z.string().optional(),
  exchangeRateToBrl: z.number().positive().optional(),
  grossAmountBrl: z.number().nonnegative().optional(),
  classification: incomeClassificationSchema.optional()
});

export type IncomeSource = z.infer<typeof incomeSourceSchema>;
