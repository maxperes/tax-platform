import { z } from "zod";
import { dataOriginSchema } from "./data-origin.js";

export const trustTypeSchema = z.enum(["revocable", "irrevocable", "unknown"]);

export const trustStructureSchema = z.object({
  name: z.string().min(1),
  jurisdiction: z.string().min(2),
  trustType: trustTypeSchema,
  settlorName: z.string().optional(),
  beneficiaryNames: z.array(z.string()).optional(),
  isGrantorTrust: z.boolean().optional(),
  annualDistributionsUsd: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  dataOrigin: dataOriginSchema.default("manual")
});

export type TrustStructureInput = z.infer<typeof trustStructureSchema>;
export type TrustType = z.infer<typeof trustTypeSchema>;
