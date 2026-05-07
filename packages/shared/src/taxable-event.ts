import { z } from "zod";

export const taxableEventTypeSchema = z.enum([
  "income",
  "capital_gain",
  "asset",
  "international",
  "corporate",
  "complex"
]);

export const taxableEventSchema = z.object({
  userId: z.string().uuid(),
  taxYear: z.number().int(),
  eventType: taxableEventTypeSchema,
  description: z.string().min(1),
  amountOriginal: z.number().optional(),
  currency: z.string().length(3).optional(),
  amountBrl: z.number().optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isTaxable: z.boolean(),
  incomeSourceId: z.string().uuid().optional(),
  requiresReview: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type TaxableEvent = z.infer<typeof taxableEventSchema>;
