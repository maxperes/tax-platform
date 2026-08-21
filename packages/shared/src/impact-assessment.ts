import { z } from "zod";
import { reliabilityStampSchema, riskLevelSchema } from "./legal-rule.js";

export const impactLayerSchema = z.enum(["as_is", "to_be", "planning"]);
export type ImpactLayer = z.infer<typeof impactLayerSchema>;

export const taxabilityStatusSchema = z.enum([
  "not_taxable_br",
  "taxable_br",
  "reporting_only",
  "deferred",
  "complex"
]);

export const explanationChainSchema = z.object({
  result: z.string(),
  why: z.string(),
  rule: z.string(),
  calculation: z.string(),
  documentNeeded: z.string(),
  nextAction: z.string()
});

export type ExplanationChain = z.infer<typeof explanationChainSchema>;

export const categoryImpactRowSchema = z.object({
  category: z.string(),
  beforeJurisdictions: z.array(z.string()),
  afterJurisdictions: z.array(z.string()),
  annualAmount: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  estimatedBrGrossTax: z.number().nonnegative().optional(),
  brazilianTax: z.number().nonnegative().optional(),
  foreignTaxCredit: z.number().nonnegative().optional(),
  netPayable: z.number().nonnegative().optional(),
  brazilianTaxTreatment: z.string().optional(),
  inBrTaxBase: z.boolean().optional(),
  taxability: taxabilityStatusSchema,
  reliability: reliabilityStampSchema,
  explanation: explanationChainSchema.optional()
});

export type CategoryImpactRow = z.infer<typeof categoryImpactRowSchema>;

export const obligationItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  required: z.boolean(),
  reason: z.string(),
  reliability: reliabilityStampSchema,
  probe: z.boolean().optional(),
  explanation: explanationChainSchema.optional()
});

export type ObligationItem = z.infer<typeof obligationItemSchema>;

export const declarationItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  required: z.boolean(),
  reason: z.string()
});

export type DeclarationItem = z.infer<typeof declarationItemSchema>;

export const doubleTaxItemSchema = z.object({
  category: z.string(),
  originCountry: z.string(),
  homeContinues: z.boolean(),
  brazilTaxes: z.boolean(),
  ftcLikely: z.boolean(),
  treatyArticleHint: z.string().optional(),
  notes: z.string(),
  reliability: reliabilityStampSchema
});

export type DoubleTaxItem = z.infer<typeof doubleTaxItemSchema>;

export const riskItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  level: riskLevelSchema,
  rationale: z.string(),
  reliability: reliabilityStampSchema.optional()
});

export type RiskItem = z.infer<typeof riskItemSchema>;

export const planningOpportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedSavingsHint: z.string().optional(),
  priority: z.number().int().min(1).max(99),
  proOnly: z.boolean().default(false),
  reliability: reliabilityStampSchema.optional()
});

export type PlanningOpportunity = z.infer<typeof planningOpportunitySchema>;

export const runToBeSchema = z.object({
  twinCaseId: z.string().uuid(),
  hypothesisResidencyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Basic = gross (no reliefs). Pro may request optimized. */
  applyReliefs: z.boolean().default(false)
});

export type RunToBeInput = z.infer<typeof runToBeSchema>;

export const residencyLifecycleStateSchema = z.enum([
  "nonresident",
  "tax_resident",
  "exit",
  "return"
]);

export type ResidencyLifecycleState = z.infer<typeof residencyLifecycleStateSchema>;

export const situationSummarySchema = z.object({
  brazilianTaxResidentFrom: z.string().nullable(),
  lifecycleState: residencyLifecycleStateSchema,
  foreignIncomeSubjectToAnalysis: z.number().nonnegative(),
  brazilianTax: z.number().nonnegative(),
  foreignTaxCredit: z.number().nonnegative(),
  netPayable: z.number().nonnegative(),
  estimatedBrGrossTaxTotal: z.number().nonnegative(),
  currency: z.literal("BRL"),
  requiredFilings: z.array(z.string())
});

export type SituationSummary = z.infer<typeof situationSummarySchema>;

/** Monthly carnê-leão / DARF sketch from BR-IRPF-EXT-001 — orientation, not a payment slip. */
export const monthlyCarneLeaoSketchSchema = z.object({
  taxMonth: z.string().regex(/^\d{4}-\d{2}$/),
  taxableBaseBrl: z.number().nonnegative(),
  taxComputedBrl: z.number().nonnegative(),
  creditAppliedBrl: z.number().nonnegative(),
  netDueBrl: z.number().nonnegative(),
  dueDate: z.string(),
  probe: z.boolean().optional()
});

export type MonthlyCarneLeaoSketch = z.infer<typeof monthlyCarneLeaoSketchSchema>;

export const usFederalSketchSchema = z.object({
  grossIncomeUsd: z.number().nonnegative(),
  netTaxDueUsd: z.number().nonnegative(),
  taxCreditAppliedUsd: z.number().nonnegative(),
  filingStatusAssumed: z.string(),
  note: z.string()
});

export type UsFederalSketch = z.infer<typeof usFederalSketchSchema>;

export const crossBorderComparisonSchema = z.object({
  applicable: z.boolean(),
  usFederal: usFederalSketchSchema.optional(),
  brazil: z.object({
    taxBrl: z.number().nonnegative(),
    ftcBrl: z.number().nonnegative(),
    netPayableBrl: z.number().nonnegative()
  }),
  notes: z.string()
});

export type CrossBorderComparison = z.infer<typeof crossBorderComparisonSchema>;

export const planningScenarioSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  estimatedBrTaxDelta: z.number(),
  notes: z.array(z.string()),
  proOnly: z.boolean()
});

export type PlanningScenario = z.infer<typeof planningScenarioSchema>;

export const documentKindSchema = z.enum([
  "passport",
  "bank_statement",
  "us_tax_return",
  "other"
]);

export type DocumentKind = z.infer<typeof documentKindSchema>;
