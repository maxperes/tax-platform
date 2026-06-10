import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const exemptionSchema = z.object({
  exemptionType: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  amountBrl: z.number().nonnegative().optional(),
  taxPeriod: z.string().min(1),
  applicationScope: z.enum(["monthly", "annual"]),
  notes: z.string().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type Exemption = z.infer<typeof exemptionSchema>;
