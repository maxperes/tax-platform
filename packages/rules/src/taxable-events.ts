import type { IncomeSource } from "@tax-platform/shared";
import type { AssetInput } from "@tax-platform/shared";
import type { InternationalTransferInput } from "@tax-platform/shared";
import type { TrustStructureInput } from "@tax-platform/shared";

export interface DetectedTaxableEvent {
  description: string;
  eventType: "income" | "capital_gain" | "asset" | "international" | "corporate" | "complex";
  isTaxable: boolean;
  requiresReview: boolean;
  incomeSourceId?: string;
  sourceRef?: string;
}

function incomeEvent(inc: IncomeSource): DetectedTaxableEvent {
  const ownTransfer =
    inc.transferredToBrazil === true &&
    inc.remainedAbroad !== true &&
    inc.nature !== "work" &&
    inc.nature !== "investment";
  if (ownTransfer) {
    return {
      description: `Own-account transfer from ${inc.payerName} (${inc.originCountry}) — non-taxable`,
      eventType: "international",
      isTaxable: false,
      requiresReview: false
    };
  }
  const isForeign = inc.originCountry !== "BR";
  const trustLike = inc.nature === "trust" || inc.incomeType.toLowerCase().includes("trust");
  const corporate = inc.nature === "corporate";
  return {
    description: `Income from ${inc.payerName} (${inc.originCountry})`,
    eventType: trustLike ? "complex" : corporate ? "corporate" : isForeign ? "international" : "income",
    isTaxable: inc.classification?.taxTreatment !== "non_taxable" && inc.classification?.taxTreatment !== "exempt",
    requiresReview: trustLike || inc.classification?.taxTreatment === "complex"
  };
}

/** RF-003: derive taxable events from incomes, assets, transfers, and trusts. */
export function detectTaxableEventsFromIncomes(incomes: IncomeSource[]): DetectedTaxableEvent[] {
  return incomes.map((inc) => incomeEvent(inc));
}

export function detectTaxableEventsFromAssets(assets: AssetInput[]): DetectedTaxableEvent[] {
  return assets.map((a) => ({
    description: `Asset registered: ${a.name} (${a.country})`,
    eventType: "asset" as const,
    isTaxable: false,
    requiresReview: a.country !== "BR" || /trust|offshore/i.test(a.assetType),
    sourceRef: a.name
  }));
}

export function detectTaxableEventsFromTransfers(
  transfers: InternationalTransferInput[],
  assessments: { isTaxable: boolean; requiresReview: boolean; description: string }[]
): DetectedTaxableEvent[] {
  return transfers.map((t, i) => ({
    description: assessments[i]?.description ?? `Transfer ${t.fromCountry} → ${t.toCountry}`,
    eventType: "international" as const,
    isTaxable: assessments[i]?.isTaxable ?? false,
    requiresReview: assessments[i]?.requiresReview ?? true
  }));
}

export function detectTaxableEventsFromTrusts(
  trusts: TrustStructureInput[],
  assessments: { isTaxable: boolean; requiresReview: boolean }[]
): DetectedTaxableEvent[] {
  return trusts.map((t, i) => ({
    description: `Trust: ${t.name} (${t.jurisdiction}, ${t.trustType})`,
    eventType: "complex" as const,
    isTaxable: assessments[i]?.isTaxable ?? false,
    requiresReview: assessments[i]?.requiresReview ?? true
  }));
}
