import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const assetSchema = z.object({
  name: z.string().min(1),
  assetType: z.string().min(1),
  country: z.string().min(2),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acquisitionValue: z.number().nonnegative(),
  acquisitionCurrency: z.string().length(3),
  currentValue: z.number().nonnegative().optional(),
  currentCurrency: z.string().length(3).optional(),
  isForeignAsset: z.boolean().optional(),
  notes: z.string().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type AssetInput = z.infer<typeof assetSchema>;
