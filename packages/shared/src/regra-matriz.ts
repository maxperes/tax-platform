import { z } from "zod";

/** Material natures covered by BR-IRPF-EXT-001 (others route elsewhere). */
export const irpfExtNatureSchema = z.enum([
  "trabalho",
  "aposentadoria",
  "pensao",
  "aluguel",
  "royalties",
  "juros",
  "dividendos",
  "outros_rendimentos"
]);

export type IrpfExtNature = z.infer<typeof irpfExtNatureSchema>;

export const brazilianTaxRegimeSchema = z.enum([
  "progressivo",
  "tributacao_definitiva",
  "lei_14754_offshore",
  "ganho_capital",
  "outro"
]);

export type BrazilianTaxRegime = z.infer<typeof brazilianTaxRegimeSchema>;

export const incidenceOutcomeSchema = z.enum([
  "incide",
  "isento",
  "fora_do_campo",
  "roteado",
  "controvertido"
]);

export type IncidenceOutcome = z.infer<typeof incidenceOutcomeSchema>;

export const certezaStatusSchema = z.enum([
  "pacifico",
  "controvertido",
  "caso_a_caso"
]);

export type CertezaStatus = z.infer<typeof certezaStatusSchema>;

export const foreignIncomeItemSchema = z.object({
  id: z.string().optional(),
  natureza: irpfExtNatureSchema,
  paisFonte: z.string().min(2),
  /** Availability / credit date — NOT remittance to Brazil. */
  dataDisponibilidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moeda: z.string().length(3),
  valorBruto: z.number().nonnegative(),
  /** Share of ownership (0–1). Default 1. */
  titularidade: z.number().gt(0).max(1).default(1),
  regimeBrasileiro: brazilianTaxRegimeSchema.default("progressivo"),
  /** Foreign income tax attributable to this item (origin currency). */
  impostoPagoExterior: z.number().nonnegative().optional(),
  /** Deductible expenses in origin currency (e.g. rental condo/admin). */
  despesasAdmitidas: z.number().nonnegative().optional(),
  /** Explicit BRL conversion rate when PTAX table is overridden (tests / SME). */
  taxaConversaoBrl: z.number().positive().optional(),
  documentos: z.array(z.string()).default([])
});

export type ForeignIncomeItem = z.infer<typeof foreignIncomeItemSchema>;

export const irpfExtCaseSchema = z.object({
  /** Brazilian tax residency start date (inclusive). */
  dataInicioResidenciaBr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFimResidenciaBr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dependentes: z.number().int().min(0).default(0),
  pensaoAlimenticiaJudicialBrl: z.number().nonnegative().default(0),
  /** Age at receipt month — drives contested over-65 exemption scenarios. */
  idade: z.number().int().min(0).max(120).optional(),
  molestiaGraveComprovada: z.boolean().default(false),
  itens: z.array(foreignIncomeItemSchema).min(1)
});

export type IrpfExtCase = z.infer<typeof irpfExtCaseSchema>;
export type IrpfExtCaseInput = z.input<typeof irpfExtCaseSchema>;
