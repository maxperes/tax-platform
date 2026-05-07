import { z } from "zod";

export const taxCalculationStatusSchema = z.enum([
  "draft",
  "complete",
  "incomplete",
  "preliminary",
  "error"
]);

export const taxCalculationSchema = z.object({
  taxYear: z.number().int(),
  calculationType: z.enum(["annual_estimate", "carnet_leao_monthly", "capital_gain"]),
  grossIncome: z.number().nonnegative(),
  deductionsTotal: z.number().nonnegative(),
  exemptionsTotal: z.number().nonnegative(),
  taxableBase: z.number().nonnegative(),
  appliedRate: z.number().nonnegative(),
  grossTax: z.number().nonnegative(),
  foreignTaxPaid: z.number().nonnegative().optional(),
  taxCreditApplied: z.number().nonnegative().optional(),
  netTaxDue: z.number().nonnegative(),
  currency: z.string().length(3),
  calculationStatus: taxCalculationStatusSchema,
  requiresAdditionalReview: z.boolean(),
  ruleVersion: z.string().min(1),
  jurisdiction: z.enum(["BR", "US"]).optional(),
  dataPackVersion: z.string().optional(),
  feieApplied: z.number().nonnegative().optional(),
  ftcApplied: z.number().nonnegative().optional(),
  niit: z.number().nonnegative().optional()
});

export type TaxCalculationInput = z.infer<typeof taxCalculationSchema>;
