import { z } from "zod";

export const taxReportSectionSchema = z.object({
  title: z.string().min(1),
  bodyMarkdown: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const taxReportSchema = z.object({
  taxYear: z.number().int(),
  title: z.string().min(1),
  summaryJson: z.record(z.string(), z.unknown()),
  requiresAdditionalReview: z.boolean(),
  ruleVersion: z.string().min(1)
});

export type TaxReportInput = z.infer<typeof taxReportSchema>;
