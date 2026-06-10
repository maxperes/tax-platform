import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const entitySimulationSchema = z.object({
  scenarioName: z.string().min(1),
  proLaborePercent: z.number().min(0).max(100),
  profitDistributionPercent: z.number().min(0).max(100),
  estimatedOperatingCosts: z.number().nonnegative().default(0),
  estimatedEffectiveTaxRate: z.number().min(0).max(1),
  entityCountry: z.string().min(2).default("BR"),
  notes: z.string().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type EntitySimulationInput = z.infer<typeof entitySimulationSchema>;
