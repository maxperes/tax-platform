import { z } from "zod";

export const certaintyTierSchema = z.enum([
  "very_high",
  "high",
  "medium",
  "low",
  "contested"
]);

export type CertaintyTier = z.infer<typeof certaintyTierSchema>;

export const legalSourceKindSchema = z.enum([
  "constitution",
  "ctn",
  "rir",
  "lei",
  "in_rfb",
  "cosit",
  "treaty",
  "oecd_model",
  "mli",
  "jurisprudence_carf",
  "jurisprudence_stj",
  "jurisprudence_stf",
  "foreign_law",
  "other"
]);

export type LegalSourceKind = z.infer<typeof legalSourceKindSchema>;

export const legalSourceSchema = z.object({
  kind: legalSourceKindSchema,
  citation: z.string().min(1),
  url: z.string().url().optional()
});

export type LegalSource = z.infer<typeof legalSourceSchema>;

export const legalRuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  jurisdiction: z.enum(["BR", "US", "INTL"]),
  sources: z.array(legalSourceSchema).min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repealedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hypothesis: z.string().min(1),
  exceptions: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  certaintyTier: certaintyTierSchema,
  dependsOnCosit: z.boolean().default(false),
  tags: z.array(z.string()).default([])
});

export type LegalRule = z.infer<typeof legalRuleSchema>;

export const reliabilityStampSchema = z.object({
  conclusion: z.string().min(1),
  ruleIds: z.array(z.string()),
  sourcesSummary: z.string().min(1),
  certaintyTier: certaintyTierSchema,
  dependsOnCosit: z.boolean().default(false)
});

export type ReliabilityStamp = z.infer<typeof reliabilityStampSchema>;

export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;
