import type {
  BrazilianTaxTreatment,
  CategoryImpactRow,
  IrpfExtNature,
  TwinIncomeLine
} from "@tax-platform/shared";
import type { BrazilianTaxRegime } from "@tax-platform/shared";

export type TreatmentResolution = {
  treatment: BrazilianTaxTreatment;
  taxability: CategoryImpactRow["taxability"];
  tags: string[];
  natureza: IrpfExtNature;
  regimeBrasileiro: BrazilianTaxRegime;
};

const TREATMENT_SET = new Set<BrazilianTaxTreatment>([
  "salary_progressive",
  "llc_pass_through",
  "llc_distribution",
  "capital_gain",
  "lei_14754_offshore",
  "definitive_withholding",
  "reporting_only",
  "unknown"
]);

function isTreatment(value: string | undefined): value is BrazilianTaxTreatment {
  return Boolean(value && TREATMENT_SET.has(value as BrazilianTaxTreatment));
}

/** Map interview / copilot category strings to a structured treatment. Fallback only. */
export function treatmentFromCategory(category: string): BrazilianTaxTreatment {
  const c = category.toLowerCase();
  if (c.includes("llc_pass") || c.includes("pass_through")) return "llc_pass_through";
  if (
    c.includes("llc_distribution") ||
    c.includes("business_distribution") ||
    c === "business_distributions"
  ) {
    return "llc_distribution";
  }
  if (c.includes("trust")) return "lei_14754_offshore";
  if (c.includes("capital_gain") || c.includes("crypto") || c.includes("staking") || c.includes("nft")) {
    return "capital_gain";
  }
  if (c.includes("rsu") || c.includes("stock_option")) return "salary_progressive";
  if (c.includes("llc")) return "llc_pass_through";
  return "salary_progressive";
}

export function resolveIncomeTreatment(
  line: TwinIncomeLine,
  opts?: { hasLlcEntity?: boolean }
): TreatmentResolution {
  const explicit = line.brazilianTaxTreatment;
  const treatment = isTreatment(explicit)
    ? explicit
    : opts?.hasLlcEntity && line.category.toLowerCase().includes("distribution")
      ? "llc_distribution"
      : treatmentFromCategory(line.category);

  return resolutionForTreatment(treatment, line.category);
}

export function resolutionForTreatment(
  treatment: BrazilianTaxTreatment,
  category: string
): TreatmentResolution {
  const c = category.toLowerCase();
  if (treatment === "reporting_only") {
    return {
      treatment,
      taxability: "reporting_only",
      tags: ["assets"],
      natureza: "outros_rendimentos",
      regimeBrasileiro: "outro"
    };
  }
  if (treatment === "capital_gain") {
    return {
      treatment,
      taxability: c.includes("crypto") ? "complex" : "taxable_br",
      tags: ["gcap"],
      natureza: "outros_rendimentos",
      regimeBrasileiro: "ganho_capital"
    };
  }
  if (treatment === "lei_14754_offshore" || treatment === "llc_distribution") {
    return {
      treatment,
      taxability: "complex",
      tags: ["lei-14754", "cfc"],
      natureza: "dividendos",
      regimeBrasileiro: "lei_14754_offshore"
    };
  }
  if (treatment === "llc_pass_through") {
    return {
      treatment,
      taxability: "complex",
      tags: ["lei-14754", "cfc"],
      natureza: "trabalho",
      regimeBrasileiro: "progressivo"
    };
  }
  if (treatment === "definitive_withholding") {
    return {
      treatment,
      taxability: "taxable_br",
      tags: ["worldwide"],
      natureza: "outros_rendimentos",
      regimeBrasileiro: "tributacao_definitiva"
    };
  }

  if (c.includes("social_security") || c.includes("pension") || c.includes("ssa")) {
    return {
      treatment: treatment === "unknown" ? "salary_progressive" : treatment,
      taxability: "taxable_br",
      tags: ["social_security", "pension"],
      natureza: "aposentadoria",
      regimeBrasileiro: "progressivo"
    };
  }
  if (c.includes("rental") || c.includes("aluguel")) {
    return {
      treatment,
      taxability: "taxable_br",
      tags: ["worldwide"],
      natureza: "aluguel",
      regimeBrasileiro: "progressivo"
    };
  }
  if (c.includes("dividend")) {
    return {
      treatment,
      taxability: "taxable_br",
      tags: ["worldwide"],
      natureza: "dividendos",
      regimeBrasileiro: "progressivo"
    };
  }
  if (c.includes("interest") || c.includes("juros")) {
    return {
      treatment,
      taxability: "taxable_br",
      tags: ["worldwide"],
      natureza: "juros",
      regimeBrasileiro: "progressivo"
    };
  }

  return {
    treatment: treatment === "unknown" ? "salary_progressive" : treatment,
    taxability: "taxable_br",
    tags: ["worldwide", "taxability"],
    natureza: "trabalho",
    regimeBrasileiro: "progressivo"
  };
}

export function treatmentFromCopilotClassification(input: {
  calculationModule?: string;
  lei14754ForeignProfitsEligible?: boolean;
  incomeType?: string;
}): BrazilianTaxTreatment | undefined {
  if (input.lei14754ForeignProfitsEligible) return "llc_distribution";
  const module = input.calculationModule;
  if (module === "trust_offshore") return "lei_14754_offshore";
  if (module === "capital_gain") return "capital_gain";
  if (module === "carnet_leao" || module === "irpf") {
    const t = (input.incomeType ?? "").toLowerCase();
    if (t.includes("llc") && t.includes("distrib")) return "llc_distribution";
    if (t.includes("llc")) return "llc_pass_through";
    return "salary_progressive";
  }
  return undefined;
}
