import { z } from "zod";

export const deductionSchema = z.object({
  deductionType: z.string().min(1),
  relatedIncomeId: z.string().uuid().optional(),
  relatedEventId: z.string().uuid().optional(),
  relatedAssetId: z.string().uuid().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  exchangeRate: z.number().positive().optional(),
  amountBrl: z.number().nonnegative().optional(),
  taxPeriod: z.string().min(1),
  applicationScope: z.enum(["monthly", "annual", "transaction"]),
  isRecurring: z.boolean().optional(),
  isEligible: z.boolean().optional(),
  requiresProof: z.boolean().optional(),
  proofDocumentUrl: z.string().url().optional(),
  notes: z.string().optional()
});

export type Deduction = z.infer<typeof deductionSchema>;
