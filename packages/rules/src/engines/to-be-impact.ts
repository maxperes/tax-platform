import type {
  CategoryImpactRow,
  DeclarationItem,
  DoubleTaxItem,
  ExplanationChain,
  ObligationItem,
  ReliabilityStamp,
  RiskItem,
  SituationSummary,
  TwinIncomeLine,
  TwinInventory,
  TwinPersonInput
} from "@tax-platform/shared";
import { taxFromProgressiveTable } from "../progressive.js";
import { BR_IRPF_ANNUAL_2026 } from "../data/br/2026.js";
import { findRulesByTag, stampFromRules } from "../legal/reliability.js";
import { getBrLegalRules, LEGAL_RULE_PACK_ID } from "../legal/packs/br-2026.js";
import { applyBrIrpfExt001 } from "../legal/matriz/br-irpf-ext-001.js";
import {
  computeBrazilianResidencyStart,
  hasBrazilVitalInterestConflict,
  type ResidencyStartResult
} from "./residency-start.js";
import { buildAsIsSnapshot } from "./facts.js";
import { resolveIncomeTreatment } from "./income-treatment.js";

/** Simplified CBE probes — official BACEN bands are in USD; stamp as probe, not a filing determination. */
const CBE_ANNUAL_PROBE_BRL = 1_000_000;
const CBE_QUARTERLY_PROBE_BRL = 100_000_000;
const IRPF_EXEMPTION_BAND = BR_IRPF_ANNUAL_2026[0]?.upperBound ?? 28_559.7;

export type ToBeImpactResult = {
  hypothesisResidencyDate: string;
  residency: ResidencyStartResult;
  categoryImpacts: CategoryImpactRow[];
  declarations: DeclarationItem[];
  obligations: ObligationItem[];
  doubleTax: DoubleTaxItem[];
  risks: RiskItem[];
  estimatedBrGrossTaxTotal: number;
  brazilianTaxTotal: number;
  foreignTaxCreditTotal: number;
  netPayableTotal: number;
  situationSummary: SituationSummary;
  currency: "BRL";
  applyReliefs: boolean;
  reliefsNote: string;
  legalRulePackId: string;
  requiresReview: boolean;
  reliabilityMatrix: ReliabilityStamp[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function availabilityDate(
  line: TwinIncomeLine,
  residencyStart: string | null,
  hypothesisDate: string
): string {
  if (line.paymentDate) return line.paymentDate;
  return residencyStart ?? hypothesisDate;
}

function inBrTaxBase(
  paymentOrAvailability: string,
  residencyStart: string | null,
  hasPaymentDate: boolean
): boolean {
  if (!residencyStart) {
    // To Be hypothesis without a computed start keeps undated lines in the simulation.
    return true;
  }
  if (!hasPaymentDate) return true;
  return paymentOrAvailability >= residencyStart;
}

function explain(input: {
  result: string;
  why: string;
  rule: string;
  calculation: string;
  documentNeeded: string;
  nextAction: string;
}): ExplanationChain {
  return input;
}

/**
 * Legal Rules Engine — To Be layer.
 * Gross annual-table tax is always retained. BR-IRPF-EXT-001 + FX + FTC fill net fields.
 */
export function buildToBeImpact(input: {
  inventory: TwinInventory;
  persons?: TwinPersonInput[];
  hypothesisResidencyDate: string;
  applyReliefs?: boolean;
}): ToBeImpactResult {
  const rules = getBrLegalRules();
  const asOf = input.hypothesisResidencyDate;
  const applyReliefs = input.applyReliefs ?? false;
  const asIs = buildAsIsSnapshot({ inventory: input.inventory, persons: input.persons });
  const residency = computeBrazilianResidencyStart(asIs.inventory.residency, asOf, rules);
  const residencyStart = residency.brazilianTaxResidencyStartDate;
  const hasLlc = asIs.inventory.entities.some((e) => e.entityType.toLowerCase().includes("llc"));

  const worldwide = findRulesByTag(rules, "worldwide", asOf);
  const ftcRules = findRulesByTag(rules, "ftc", asOf);
  const vitalInterestRules = findRulesByTag(rules, "vital-interests", asOf);
  const reliabilityMatrix: ReliabilityStamp[] = [residency.reliability];

  const matrizItems = asIs.inventory.incomes.map((line, index) => {
    const resolved = resolveIncomeTreatment(line, { hasLlcEntity: hasLlc });
    const dataDisponibilidade = availabilityDate(line, residencyStart, asOf);
    return {
      line,
      resolved,
      dataDisponibilidade,
      inBase: inBrTaxBase(dataDisponibilidade, residencyStart, Boolean(line.paymentDate)),
      itemId: `line-${index}-${line.category}`
    };
  });

  const irpfExtItems = matrizItems
    .filter((row) => row.inBase && row.line.annualAmount > 0)
    .map((row) => ({
      id: row.itemId,
      natureza: row.resolved.natureza,
      paisFonte: row.line.originCountry,
      dataDisponibilidade: row.dataDisponibilidade,
      moeda: row.line.currency,
      valorBruto: row.line.annualAmount,
      regimeBrasileiro: row.resolved.regimeBrasileiro,
      impostoPagoExterior: row.line.taxPaidOrigin ?? row.line.withholdingTax,
      documentos: [] as string[]
    }));

  const matriz =
    irpfExtItems.length > 0 && residencyStart
      ? applyBrIrpfExt001({
          dataInicioResidenciaBr: residencyStart,
          dataFimResidenciaBr:
            residency.lifecycleState === "exit" ? (residency.exitDate ?? undefined) : undefined,
          dependentes: Math.max(0, (asIs.persons.length || 1) - 1),
          itens: irpfExtItems
        })
      : null;

  const brazilianTaxByItem = new Map<string, number>();
  const creditByItem = new Map<string, number>();
  const netByItem = new Map<string, number>();
  if (matriz) {
    for (const month of matriz.months) {
      const shareBase = month.base_calculo_brl || 1;
      const lines = irpfExtItems.filter((i) => i.dataDisponibilidade.slice(0, 7) === month.competencia);
      const monthGross = lines.reduce((s, l) => s + l.valorBruto, 0) || shareBase;
      for (const item of lines) {
        const weight = item.valorBruto / monthGross;
        brazilianTaxByItem.set(
          item.id ?? "",
          round2((brazilianTaxByItem.get(item.id ?? "") ?? 0) + month.imposto_apurado_brl * weight)
        );
        creditByItem.set(
          item.id ?? "",
          round2((creditByItem.get(item.id ?? "") ?? 0) + month.credito_exterior_aplicado_brl * weight)
        );
        netByItem.set(
          item.id ?? "",
          round2((netByItem.get(item.id ?? "") ?? 0) + month.imposto_a_recolher_brl * weight)
        );
      }
    }
    for (const ev of matriz.foraDoCampo) {
      brazilianTaxByItem.set(ev.itemId, 0);
      creditByItem.set(ev.itemId, 0);
      netByItem.set(ev.itemId, 0);
    }
  }

  const categoryImpacts: CategoryImpactRow[] = matrizItems.map((row) => {
    const { taxability, tags, treatment } = row.resolved;
    const matched = tags.flatMap((t) => findRulesByTag(rules, t, asOf));
    const ruleSet = matched.length > 0 ? matched : worldwide;
    const tableTax =
      taxability === "taxable_br" || taxability === "complex"
        ? taxFromProgressiveTable(row.line.annualAmount, BR_IRPF_ANNUAL_2026)
        : 0;
    const estimatedBrGrossTax = tableTax;
    const brazilianTax = row.inBase ? (brazilianTaxByItem.get(row.itemId) ?? (applyReliefs ? 0 : tableTax)) : 0;
    const foreignTaxCredit = row.inBase ? (creditByItem.get(row.itemId) ?? 0) : 0;
    const netPayable = row.inBase
      ? (netByItem.get(row.itemId) ?? Math.max(0, brazilianTax - foreignTaxCredit))
      : 0;

    const reliability = stampFromRules(
      `${row.line.category}: BR taxability after residency`,
      ruleSet
    );
    reliabilityMatrix.push(reliability);

    const ruleIds = reliability.ruleIds.join(", ") || "BR-IRPF-EXT-001";
    const explanation = explain({
      result: row.inBase
        ? `${row.line.category}: ${taxability.replace(/_/g, " ")}`
        : `${row.line.category}: outside Brazilian tax base (fora_do_campo)`,
      why: row.inBase
        ? `Availability date ${row.dataDisponibilidade} is on or after residency start ${residencyStart ?? "undetermined"}. Treatment: ${treatment}.`
        : `Availability date ${row.dataDisponibilidade} is before Brazilian tax residency start ${residencyStart ?? "(none)"} — not an exemption.`,
      rule: `${ruleIds}; ${reliability.sourcesSummary}`,
      calculation: row.inBase
        ? `Gross table tax ${estimatedBrGrossTax.toFixed(2)} BRL; matriz Brazilian tax ${brazilianTax.toFixed(2)}; FTC ${foreignTaxCredit.toFixed(2)}; net ${netPayable.toFixed(2)}`
        : `Gross table tax ${estimatedBrGrossTax.toFixed(2)} BRL retained as Basic field; net payable 0 because item is fora_do_campo`,
      documentNeeded: row.line.originCountry.toUpperCase() === "US" ? "US pay statement / 1099 / SSA" : "Foreign income statement and tax paid proof",
      nextAction: row.inBase
        ? "Confirm amount, payment date, and foreign tax paid before filing analysis"
        : "Keep this line in the Twin for the pre-residency period; it does not enter the Brazilian tax base"
    });

    return {
      category: row.line.category,
      beforeJurisdictions: [row.line.originCountry],
      afterJurisdictions: row.inBase
        ? [...new Set([row.line.originCountry, "BR"])]
        : [row.line.originCountry],
      annualAmount: row.line.annualAmount,
      currency: row.line.currency,
      estimatedBrGrossTax,
      brazilianTax: round2(brazilianTax),
      foreignTaxCredit: round2(foreignTaxCredit),
      netPayable: round2(netPayable),
      brazilianTaxTreatment: treatment,
      inBrTaxBase: row.inBase,
      taxability: row.inBase ? taxability : "not_taxable_br",
      reliability,
      explanation
    };
  });

  const estimatedBrGrossTaxTotal = categoryImpacts.reduce(
    (s, r) => s + (r.estimatedBrGrossTax ?? 0),
    0
  );
  const brazilianTaxTotal = round2(categoryImpacts.reduce((s, r) => s + (r.brazilianTax ?? 0), 0));
  const foreignTaxCreditTotal = round2(
    categoryImpacts.reduce((s, r) => s + (r.foreignTaxCredit ?? 0), 0)
  );
  const netPayableTotal = round2(categoryImpacts.reduce((s, r) => s + (r.netPayable ?? 0), 0));

  const foreignIncomeSubject = round2(
    asIs.inventory.incomes
      .filter((i) => i.originCountry.toUpperCase() !== "BR")
      .reduce((s, i) => s + i.annualAmount, 0)
  );

  const hasForeignIncomeInBase = matrizItems.some(
    (row) => row.inBase && row.line.originCountry.toUpperCase() !== "BR" && row.line.annualAmount > 0
  );
  const hasAssets = asIs.inventory.assets.length > 0;
  const hasEntities = asIs.inventory.entities.length > 0;
  const hasTrusts = asIs.inventory.trusts.length > 0;
  const hasAccounts = asIs.inventory.financialAccountsSummary.length > 0;
  const foreignAssetValue = asIs.inventory.assets
    .filter((a) => a.country.toUpperCase() !== "BR")
    .reduce((s, a) => s + (a.currentValue ?? 0), 0);
  const totalIncome = asIs.inventory.incomes.reduce((s, i) => s + i.annualAmount, 0);
  const hasFilingNexus =
    totalIncome > 0 || hasAssets || hasEntities || hasTrusts || hasAccounts;

  const residentLike =
    residency.method === "already_resident" ||
    residency.method === "permanent_visa" ||
    residency.method === "returning_brazilian" ||
    residency.method === "183_days" ||
    Boolean(residencyStart) ||
    hasBrazilVitalInterestConflict(asIs.inventory.residency);

  const irpfRule = findRulesByTag(rules, "irpf", asOf);
  const carneRule = findRulesByTag(rules, "carne-leao", asOf);
  const gcapRule = findRulesByTag(rules, "gcap", asOf);
  const cfcRule = findRulesByTag(rules, "cfc", asOf);
  const cbeRule = findRulesByTag(rules, "cbe", asOf);
  const bensRule = findRulesByTag(rules, "assets", asOf);
  const darfRule = findRulesByTag(rules, "darf", asOf);
  const exitRule = findRulesByTag(rules, "exit-declaration", asOf);

  const irpfRequired = residentLike && hasFilingNexus;
  const carneRequired = residentLike && hasForeignIncomeInBase;
  const gcapRequired =
    residentLike &&
    asIs.inventory.incomes.some((i) => {
      const t = resolveIncomeTreatment(i, { hasLlcEntity: hasLlc });
      return t.treatment === "capital_gain" || i.category.toLowerCase().includes("capital_gain");
    });
  const cfcRequired = residentLike && (hasEntities || hasTrusts);
  const cbeBand =
    foreignAssetValue >= CBE_QUARTERLY_PROBE_BRL
      ? "quarterly_probe"
      : foreignAssetValue >= CBE_ANNUAL_PROBE_BRL
        ? "annual_probe"
        : "below";
  const cbeRequired = residentLike && cbeBand !== "below";
  const rbeRequired = residentLike && hasEntities;
  const bensRequired = irpfRequired && (hasAssets || hasAccounts || hasEntities || hasTrusts);
  const darfRequired = carneRequired || gcapRequired;
  const alreadyFiledExit = asIs.inventory.residency.priorPermanentExitBrazil === true;
  const leftWithoutFiling =
    !alreadyFiledExit &&
    (residency.lifecycleState === "exit" || asIs.inventory.residency.intendsToRemain === "no") &&
    Boolean(asIs.inventory.residency.firstEntryBrazilDate);
  const exitRequired = leftWithoutFiling;

  const obligations: ObligationItem[] = [
    {
      code: "IRPF",
      label: "IRPF (DIRPF)",
      required: irpfRequired,
      reason: irpfRequired
        ? "Brazilian tax residency plus income or assets on file meet a simplified filing-nexus probe."
        : totalIncome > 0 && totalIncome < IRPF_EXEMPTION_BAND && !hasAssets
          ? "Income is below the first annual IRPF band and no assets are on file — IRPF not indicated on this probe."
          : "No Brazilian residency start (or vital-interest nexus) with filing facts on file.",
      reliability: stampFromRules("IRPF obligation", irpfRule),
      explanation: explain({
        result: irpfRequired ? "IRPF filing indicated" : "IRPF filing not indicated",
        why: irpfRequired
          ? "Residency (or vital-interest review) plus income/assets on the Twin."
          : "Thresholds / residency start not met on facts currently on file.",
        rule: "br-obligation-irpf",
        calculation: `Total income ${totalIncome.toFixed(2)}; exemption band ${IRPF_EXEMPTION_BAND}; residentLike=${residentLike}`,
        documentNeeded: "Identity, residency evidence, income statements",
        nextAction: irpfRequired ? "Assemble DIRPF inputs" : "No IRPF action on current facts"
      })
    },
    {
      code: "CARNE_LEAO",
      label: "Carnê-leão",
      required: carneRequired,
      reason: carneRequired
        ? "Foreign-source income in the Brazilian tax base typically requires monthly carnê-leão."
        : "No foreign-source income in the Brazilian tax base on file.",
      reliability: stampFromRules("Carnê-leão obligation", carneRule),
      explanation: explain({
        result: carneRequired ? "Carnê-leão indicated" : "Carnê-leão not indicated",
        why: carneRequired
          ? "Post-residency foreign income without Brazilian withholding."
          : "No in-base foreign income.",
        rule: "BR-IRPF-EXT-001 / br-obligation-carne-leao",
        calculation: `Net payable from matriz ${netPayableTotal.toFixed(2)} BRL`,
        documentNeeded: "Monthly income proofs and foreign tax receipts",
        nextAction: carneRequired ? "Calendar monthly DARF / carnê-leão" : "None"
      })
    },
    {
      code: "GCAP",
      label: "GCAP (capital gains)",
      required: gcapRequired,
      reason: gcapRequired
        ? "Capital gain events may require GCAP."
        : "No capital-gain treatment lines on file.",
      reliability: stampFromRules("GCAP obligation", gcapRule),
      explanation: explain({
        result: gcapRequired ? "GCAP indicated" : "GCAP not indicated",
        why: gcapRequired ? "Capital-gain treatment is on an income line." : "No GCAP lines.",
        rule: "br-obligation-gcap",
        calculation: `gcapRequired=${gcapRequired}`,
        documentNeeded: "Brokerage 1099-B / disposal contracts",
        nextAction: gcapRequired ? "Compute GCAP for each disposal" : "None"
      })
    },
    {
      code: "DARF",
      label: "DARF payment",
      required: darfRequired,
      reason: darfRequired
        ? "Carnê-leão or GCAP on file implies a DARF payment obligation to be scheduled."
        : "No monthly or capital-gain payment event indicated.",
      reliability: stampFromRules("DARF obligation", darfRule.length ? darfRule : carneRule),
      explanation: explain({
        result: darfRequired ? "DARF likely required" : "No DARF indicated",
        why: darfRequired ? "A tax payment event (carnê-leão or GCAP) is on the obligation list." : "No payment event.",
        rule: "br-obligation-darf",
        calculation: darfRequired ? `Linked to carnê-leão=${carneRequired} gcap=${gcapRequired}` : "n/a",
        documentNeeded: "Payment receipts once generated",
        nextAction: darfRequired ? "Prepare DARF for the relevant competence" : "None"
      })
    },
    {
      code: "CFC_LEI_14754",
      label: "Lei 14.754 / CFC-style foreign entity taxation",
      required: cfcRequired,
      reason: cfcRequired
        ? "Foreign entities or trusts may fall under Lei 14.754 — requires characterization."
        : "No foreign entities or trusts on file.",
      reliability: stampFromRules("Lei 14.754 applicability", cfcRule),
      explanation: explain({
        result: cfcRequired ? "Lei 14.754 review indicated" : "Lei 14.754 not indicated",
        why: cfcRequired ? "Foreign entities or trusts are on the Twin." : "None on file.",
        rule: "br-lei-14754-cfc",
        calculation: `entities=${asIs.inventory.entities.length} trusts=${asIs.inventory.trusts.length}`,
        documentNeeded: "Entity formation docs and ownership percentages",
        nextAction: cfcRequired ? "Characterize each entity/trust" : "None"
      })
    },
    {
      code: "CBE",
      label: "BACEN CBE",
      required: cbeRequired,
      probe: true,
      reason:
        cbeBand === "quarterly_probe"
          ? "Foreign assets appear to meet a simplified quarterly CBE probe (not an official USD-band determination)."
          : cbeBand === "annual_probe"
            ? "Foreign assets appear to meet a simplified annual CBE threshold probe — confirm official BACEN USD thresholds."
            : "Foreign asset totals below simplified threshold probe (still confirm official BACEN bands).",
      reliability: stampFromRules("CBE obligation", cbeRule),
      explanation: explain({
        result: cbeRequired ? `CBE ${cbeBand}` : "CBE below probe",
        why: "Simplified BRL probe — official BACEN bands are in USD and must be confirmed.",
        rule: "br-bacen-cbe",
        calculation: `foreignAssetValue=${foreignAssetValue}; annualProbe=${CBE_ANNUAL_PROBE_BRL}; quarterlyProbe=${CBE_QUARTERLY_PROBE_BRL}`,
        documentNeeded: "Year-end foreign asset statements",
        nextAction: cbeRequired ? "Confirm official BACEN USD thresholds" : "None"
      })
    },
    {
      code: "RBE",
      label: "RBE / related BACEN registrations",
      required: rbeRequired,
      reason: rbeRequired
        ? "Foreign company ownership may require BACEN/RBE analysis."
        : "No foreign company ownership on file.",
      reliability: stampFromRules("RBE review", cbeRule)
    },
    {
      code: "BENS_DIREITOS",
      label: "Bens e direitos declaration",
      required: bensRequired,
      reason: bensRequired
        ? "Worldwide assets are declared on IRPF when a filing nexus and assets/accounts are on file."
        : "No IRPF nexus with assets on file.",
      reliability: stampFromRules("Bens e direitos", bensRule),
      explanation: explain({
        result: bensRequired ? "Bens e direitos indicated" : "Bens e direitos not indicated",
        why: bensRequired ? "IRPF nexus plus assets/accounts on file." : "No IRPF + asset nexus.",
        rule: "br-declaration-bens",
        calculation: `irpfRequired=${irpfRequired} hasAssets=${hasAssets}`,
        documentNeeded: "Year-end balances and acquisition cost",
        nextAction: bensRequired ? "Inventory worldwide assets for DIRPF" : "None"
      })
    },
    {
      code: "EXIT_DECLARATION",
      label: "Declaração de saída definitiva",
      required: exitRequired,
      reason: alreadyFiledExit
        ? "A prior saída definitiva is already on file — re-entry still needs review."
        : exitRequired
          ? "Facts indicate a permanent departure without a recorded saída definitiva."
          : "No exit-declaration trigger on current facts.",
      reliability: stampFromRules("Exit declaration", exitRule.length ? exitRule : irpfRule),
      explanation: explain({
        result: exitRequired ? "Exit declaration indicated" : "Exit declaration not indicated",
        why: alreadyFiledExit
          ? "Prior permanent exit already declared."
          : exitRequired
            ? "Departure / intent not to remain without a recorded saída."
            : "Not in an exit lifecycle.",
        rule: "br-obligation-exit",
        calculation: `lifecycle=${residency.lifecycleState}; priorExit=${alreadyFiledExit}`,
        documentNeeded: "Prior DIRPF / saída receipt if any",
        nextAction: exitRequired ? "Evaluate declaração de saída definitiva" : "None"
      })
    }
  ];

  const anyRequired = obligations.some((o) => o.required);
  obligations.push({
    code: "NO_FILING",
    label: "No filing required",
    required: !anyRequired,
    reason: anyRequired
      ? "At least one filing or payment obligation is indicated."
      : "No IRPF, carnê-leão, GCAP, CBE, or exit obligation is indicated on current facts.",
    reliability: stampFromRules("No filing required", irpfRule),
    explanation: explain({
      result: anyRequired ? "Filings are indicated" : "No filing required on current facts",
      why: anyRequired ? "See required obligation codes." : "Residency start and thresholds not met.",
      rule: "br-obligation-irpf thresholds",
      calculation: `requiredCodes=${obligations.filter((o) => o.required).map((o) => o.code).join(",") || "none"}`,
      documentNeeded: "None beyond the Twin inventory",
      nextAction: anyRequired ? "Complete indicated filings" : "No Brazilian filing action on this map"
    })
  });

  for (const o of obligations) reliabilityMatrix.push(o.reliability);

  const declarations: DeclarationItem[] = [
    {
      code: "BENS_DIREITOS",
      label: "Bens e direitos (worldwide)",
      required: bensRequired,
      reason: bensRequired
        ? "Residents declare worldwide assets on IRPF when filing."
        : "No IRPF + asset nexus on file."
    },
    {
      code: "BANK_ACCOUNTS",
      label: "Foreign bank / brokerage accounts",
      required: asIs.inventory.financialAccountsSummary.length > 0 || hasAssets,
      reason: "Financial accounts abroad are reported as assets / income sources."
    },
    {
      code: "COMPANIES",
      label: "Equity participations",
      required: hasEntities,
      reason: "Company ownership must be declared and may trigger Lei 14.754 analysis."
    },
    {
      code: "REAL_ESTATE",
      label: "Real estate",
      required: asIs.inventory.assets.some((a) => a.assetType.toLowerCase().includes("real")),
      reason: "Real estate is declared and rental/CG events tracked."
    },
    {
      code: "TRUSTS",
      label: "Trust interests",
      required: hasTrusts,
      reason: "Trust structures require specialized disclosure and characterization."
    }
  ];

  const doubleTax: DoubleTaxItem[] = categoryImpacts.map((row) => {
    const origin = row.beforeJurisdictions[0] ?? "XX";
    const reliability = stampFromRules(`Double tax map for ${row.category}`, ftcRules);
    reliabilityMatrix.push(reliability);
    return {
      category: row.category,
      originCountry: origin,
      homeContinues: origin.toUpperCase() !== "BR",
      brazilTaxes: row.taxability === "taxable_br" || row.taxability === "complex",
      ftcLikely: origin.toUpperCase() === "US" && (row.foreignTaxCredit ?? 0) >= 0,
      treatyArticleHint:
        origin.toUpperCase() === "US"
          ? "No comprehensive US–BR income tax treaty; reciprocity/FTC path"
          : undefined,
      notes:
        origin.toUpperCase() === "US"
          ? "US taxation generally continues for US persons; Brazil may also tax — evaluate FTC/reciprocity."
          : "Origin-country taxation may continue alongside Brazilian worldwide taxation.",
      reliability
    };
  });

  const risks: RiskItem[] = [];
  if (hasBrazilVitalInterestConflict(asIs.inventory.residency)) {
    risks.push({
      code: "vital_interests_brazil",
      label: "Center of vital interests may remain in Brazil",
      level: "high",
      rationale:
        "Claimed foreign tax residency while Brazil electoral, banking, real-estate, or DIRPF-address ties remain. Substance may keep Brazilian tax residence — professional review required.",
      reliability: stampFromRules("Vital-interest / substance conflict", vitalInterestRules)
    });
  }
  if (asIs.inventory.entities.some((e) => e.entityType.toLowerCase().includes("llc"))) {
    risks.push({
      code: "llc_transparent",
      label: "Transparent LLC characterization",
      level: "high",
      rationale: "US LLC tax transparency vs Brazilian entity treatment is frequently contested.",
      reliability: stampFromRules("LLC risk", cfcRule)
    });
  }
  if (asIs.inventory.trusts.some((t) => t.trustType === "irrevocable")) {
    risks.push({
      code: "irrevocable_trust",
      label: "Irrevocable trust",
      level: "high",
      rationale: "Irrevocable trusts require careful Lei 14.754 / control analysis.",
      reliability: stampFromRules("Trust risk", cfcRule)
    });
  }
  if (hasEntities) {
    risks.push({
      code: "foreign_company",
      label: "Foreign company",
      level: "medium",
      rationale: "Foreign ownership may trigger CFC-style or Lei 14.754 taxation.",
      reliability: stampFromRules("Foreign company risk", cfcRule)
    });
  }
  if (asIs.inventory.incomes.some((i) => /crypto|staking|nft|yield/i.test(i.category))) {
    risks.push({
      code: "crypto",
      label: "Crypto / DeFi income",
      level: "medium",
      rationale: "Characterization and documentation of crypto yields is often incomplete.",
      reliability: stampFromRules("Crypto risk", worldwide)
    });
  }
  if (asIs.inventory.incomes.some((i) => !i.taxPaidOrigin && !i.withholdingTax)) {
    risks.push({
      code: "undocumented_tax",
      label: "Income without foreign tax documentation",
      level: "medium",
      rationale: "Missing foreign tax paid / withholding proof weakens FTC and audit defense."
    });
  }
  if (asIs.inventory.entities.some((e) => (e.ownershipPercent ?? 0) >= 50)) {
    risks.push({
      code: "historical_dividends",
      label: "Retained earnings / historical dividends",
      level: "medium",
      rationale: "Distributing retained earnings before residency can be a planning lever (Layer 3)."
    });
  }

  for (const r of risks) {
    if (r.reliability) reliabilityMatrix.push(r.reliability);
  }

  const requiredFilings = obligations.filter((o) => o.required && o.code !== "NO_FILING").map((o) => o.label);

  const situationSummary: SituationSummary = {
    brazilianTaxResidentFrom: residencyStart,
    lifecycleState: residency.lifecycleState,
    foreignIncomeSubjectToAnalysis: foreignIncomeSubject,
    brazilianTax: brazilianTaxTotal,
    foreignTaxCredit: foreignTaxCreditTotal,
    netPayable: netPayableTotal,
    estimatedBrGrossTaxTotal,
    currency: "BRL",
    requiredFilings
  };

  return {
    hypothesisResidencyDate: input.hypothesisResidencyDate,
    residency,
    categoryImpacts,
    declarations,
    obligations,
    doubleTax,
    risks,
    estimatedBrGrossTaxTotal,
    brazilianTaxTotal,
    foreignTaxCreditTotal,
    netPayableTotal,
    situationSummary,
    currency: "BRL",
    applyReliefs,
    reliefsNote: applyReliefs
      ? "Pro: BR-IRPF-EXT-001 + BR-CRED-EXT-001 populate Brazilian tax, foreign tax credit, and net payable. Gross annual-table tax is retained as a separate field."
      : "Gross mode (Basic): annual-table tax with no exemptions. Brazilian tax, FTC, and net payable are still computed via BR-IRPF-EXT-001 for explainability.",
    legalRulePackId: LEGAL_RULE_PACK_ID,
    requiresReview:
      residency.requiresReview ||
      risks.some((r) => r.level === "high") ||
      categoryImpacts.some((c) => c.taxability === "complex"),
    reliabilityMatrix
  };
}
