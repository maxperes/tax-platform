import { z } from "zod";

export const monthlyTaxCalculationItemSchema = z.object({
  incomeSourceId: z.string().uuid().optional(),
  taxEventId: z.string().uuid().optional(),
  incomeType: z.string().min(1),
  originCountry: z.string().min(2),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  originalAmount: z.number().nonnegative(),
  originalCurrency: z.string().length(3),
  exchangeRate: z.number().positive(),
  amountBrl: z.number().nonnegative(),
  foreignTaxPaid: z.number().nonnegative().optional(),
  deductionAmount: z.number().nonnegative().optional(),
  exemptionAmount: z.number().nonnegative().optional(),
  taxableAmount: z.number().nonnegative(),
  calculatedTax: z.number().nonnegative(),
  requiresReview: z.boolean().optional(),
  notes: z.string().optional()
});

export type MonthlyTaxCalculationItem = z.infer<typeof monthlyTaxCalculationItemSchema>;
