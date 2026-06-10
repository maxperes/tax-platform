import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const transferClassificationSchema = z.enum([
  "own_account",
  "income_receipt",
  "trust_distribution",
  "gift",
  "loan",
  "unknown"
]);

export const internationalTransferSchema = z.object({
  fromCountry: z.string().min(2),
  toCountry: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().length(3),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classification: transferClassificationSchema,
  relatedIncomeId: z.string().uuid().optional(),
  relatedTrustId: z.string().uuid().optional(),
  notes: z.string().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type InternationalTransferInput = z.infer<typeof internationalTransferSchema>;
export type TransferClassification = z.infer<typeof transferClassificationSchema>;
