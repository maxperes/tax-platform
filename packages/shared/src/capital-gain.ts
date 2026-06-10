import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const capitalGainCalculationSchema = z.object({
  assetId: z.string().uuid().optional(),
  taxEventId: z.string().uuid().optional(),
  assetType: z.string().min(1),
  assetCountry: z.string().min(2),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionValue: z.number().nonnegative(),
  acquisitionCurrency: z.string().length(3),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  saleValue: z.number().nonnegative(),
  saleCurrency: z.string().length(3),
  ownershipPercentageSold: z.number().min(0).max(100),
  deductibleExpenses: z.number().nonnegative().default(0),
  foreignTaxPaid: z.number().nonnegative().optional(),
  exchangeRateAcquisition: z.number().positive().optional(),
  exchangeRateSale: z.number().positive().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type CapitalGainCalculationInput = z.infer<typeof capitalGainCalculationSchema>;
