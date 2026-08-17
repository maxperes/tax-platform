import type {
  IncidenceOutcome,
  IrpfExtCaseInput,
  TwinInventory,
  TwinPersonInput,
  UserPlan
} from "@tax-platform/shared";
import type { ResidencyStartResult } from "../../engines/residency-start.js";

/** Cited public source for a golden replay case. */
export type PublicCaseSource = {
  citation: string;
  url: string;
  retrievedAt: string;
};

export type PublicCaseLegalFx = {
  valor: number;
  moeda: string;
  dataDisponibilidade: string;
  taxaConversaoBrl: number;
  expectedValorBrl: number;
};

export type PublicCaseLegalCredit = {
  impostoBrasileiroComRendimento: number;
  impostoBrasileiroSemRendimento: number;
  impostoPagoExteriorBrl: number;
  expectedLimiteCreditoBrl: number;
  expectedCreditoAplicadoBrl: number;
  reciprocidadeReconhecida?: boolean;
};

export type PublicCaseLegal = {
  irpfExt?: IrpfExtCaseInput;
  expectedIncidence?: IncidenceOutcome;
  fx?: PublicCaseLegalFx;
  credit?: PublicCaseLegalCredit;
};

export type PublicCaseExpectedImpact = {
  sectionCount: number;
  requiredObligations: string[];
  categoryTaxability: Record<string, string>;
  requiredRisks?: string[];
  requiresAdditionalReview?: boolean;
  residencyMethod?: ResidencyStartResult["method"];
  /** Gross-mode To Be tax is the 2026 annual table applied to this BRL base — not RFB DAA with/without. */
  grossTaxBaseBrl?: number;
};

export type PublicCaseTwin = {
  inventory: TwinInventory;
  persons: TwinPersonInput[];
  hypothesisResidencyDate: string;
  plan: UserPlan;
};

/**
 * Replay fixture: Twin → Impact Assessment, plus optional legal FX/credit numbers.
 * See docs/tax-rules-governance.md (Public-case fixtures).
 */
export type PublicCaseFixture = {
  id: string;
  title: string;
  source: PublicCaseSource;
  limitations: string[];
  twin?: PublicCaseTwin;
  expectedImpact?: PublicCaseExpectedImpact;
  legal?: PublicCaseLegal;
};
