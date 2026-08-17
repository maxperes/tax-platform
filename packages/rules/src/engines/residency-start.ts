import type {
  BrazilEntryPathway,
  LegalRule,
  ReliabilityStamp,
  ResidencyLifecycleState,
  TwinResidencyFacts
} from "@tax-platform/shared";
import { findRulesByTag, stampFromRules } from "../legal/reliability.js";
import { getBrLegalRules } from "../legal/packs/br-2026.js";
import { evaluateBrResid001, type Resid001Method } from "../legal/matriz/br-resid-001.js";

export type ResidencyStartResult = {
  brazilianTaxResidencyStartDate: string | null;
  method:
    | "permanent_visa"
    | "183_days"
    | "returning_brazilian"
    | "already_resident"
    | "undetermined";
  lifecycleState: ResidencyLifecycleState;
  exitDate: string | null;
  returnDate: string | null;
  anticipatable: boolean;
  notes: string[];
  requiresReview: boolean;
  reliability: ReliabilityStamp;
  matchedRules: LegalRule[];
};

export function residencyLifecycle(
  facts: TwinResidencyFacts,
  startDate: string | null,
  method: ResidencyStartResult["method"]
): {
  lifecycleState: ResidencyLifecycleState;
  exitDate: string | null;
  returnDate: string | null;
} {
  const exitDate = facts.priorPermanentExitDate ?? null;
  const becameResident = Boolean(startDate) || method === "already_resident";

  if (facts.priorPermanentExitBrazil && becameResident) {
    const returnDate =
      startDate && exitDate && startDate > exitDate
        ? startDate
        : startDate ?? facts.firstEntryBrazilDate ?? null;
    return { lifecycleState: "return", exitDate, returnDate };
  }

  if (facts.priorPermanentExitBrazil && !becameResident) {
    return { lifecycleState: "exit", exitDate, returnDate: null };
  }

  if (facts.intendsToRemain === "no" && !becameResident && facts.firstEntryBrazilDate) {
    return {
      lifecycleState: "exit",
      exitDate: exitDate ?? facts.firstEntryBrazilDate,
      returnDate: null
    };
  }

  if (becameResident) {
    return { lifecycleState: "tax_resident", exitDate, returnDate: null };
  }

  return { lifecycleState: "nonresident", exitDate, returnDate: null };
}

/**
 * Claimed foreign tax residency plus remaining Brazil economic/personal ties.
 * Does not decide the CARF holding; flags substance-over-form review.
 */
export function hasBrazilVitalInterestConflict(facts: TwinResidencyFacts): boolean {
  if (!facts.claimedForeignResidencyCountry) return false;
  return Boolean(
    facts.hasElectoralDomicileBrazil ||
      facts.filesDirpfWithBrazilAddress ||
      facts.maintainsBrazilBankAccounts ||
      facts.acquiredBrazilRealEstateAfterClaimedExit
  );
}

function tagForMethod(method: Resid001Method): string {
  if (method === "183_days") return "183-days";
  if (method === "permanent_visa") return "permanent-visa";
  if (method === "returning_brazilian") return "returning-brazilian";
  return "residency";
}

/**
 * Legal Rules — compute when Brazilian tax residency obligation starts.
 * 183-day path is BR-RESID-001 (rolling 12-month window when stay history exists).
 */
export function computeBrazilianResidencyStart(
  facts: TwinResidencyFacts,
  asOfDate: string,
  rules: LegalRule[] = getBrLegalRules()
): ResidencyStartResult {
  const notes: string[] = [];
  let requiresReview = false;

  if (hasBrazilVitalInterestConflict(facts)) {
    notes.push(
      `Claimed tax residency in ${facts.claimedForeignResidencyCountry} while Brazil vital-interest indicators remain — substance may keep Brazilian tax residency (review; not an automatic holding).`
    );
    requiresReview = true;
  }

  if (facts.priorPermanentExitBrazil) {
    notes.push("Prior permanent exit (saída definitiva) declared — re-entry characterization needs review.");
    requiresReview = true;
  }

  const resid = evaluateBrResid001(facts, asOfDate);
  const tag = tagForMethod(resid.method);
  const matched = findRulesByTag(rules, tag, asOfDate);
  const pathway: BrazilEntryPathway = facts.entryPathway ?? "unknown";

  let conclusion = "Residency start undetermined";
  if (resid.method === "already_resident") {
    conclusion = "Already Brazilian tax resident";
  } else if (resid.brazilianTaxResidencyStartDate && resid.method === "permanent_visa") {
    conclusion = `Residency starts on ${resid.brazilianTaxResidencyStartDate} (permanent pathway)`;
  } else if (resid.method === "permanent_visa") {
    conclusion = "Residency start undetermined — missing entry/visa date";
  } else if (resid.brazilianTaxResidencyStartDate && resid.method === "returning_brazilian") {
    conclusion = `Residency may start on return date ${resid.brazilianTaxResidencyStartDate}`;
  } else if (resid.method === "returning_brazilian") {
    conclusion = "Return date missing";
  } else if (resid.brazilianTaxResidencyStartDate && resid.rollingWindowApplied) {
    conclusion = `Residency start ${resid.brazilianTaxResidencyStartDate} under BR-RESID-001 rolling 183-day rule`;
  } else if (resid.brazilianTaxResidencyStartDate && resid.method === "183_days") {
    conclusion = `Approximate residency start ${resid.brazilianTaxResidencyStartDate} under 183-day rule`;
  } else if (pathway === "temporary_visa" || pathway === "digital_nomad") {
    conclusion = "Residency start not yet determined under temporary pathway";
  }

  const lifecycle = residencyLifecycle(
    facts,
    resid.brazilianTaxResidencyStartDate,
    resid.method
  );
  if (lifecycle.lifecycleState === "exit") {
    notes.push("Lifecycle state: exit (saída) — re-entry characterization may still apply.");
  }
  if (lifecycle.lifecycleState === "return") {
    notes.push(
      `Lifecycle state: return — prior exit${lifecycle.exitDate ? ` on ${lifecycle.exitDate}` : ""}; residency may restart ${lifecycle.returnDate ?? "on re-entry"}.`
    );
  }

  return {
    brazilianTaxResidencyStartDate: resid.brazilianTaxResidencyStartDate,
    method: resid.method,
    lifecycleState: lifecycle.lifecycleState,
    exitDate: lifecycle.exitDate,
    returnDate: lifecycle.returnDate,
    anticipatable: resid.anticipatable,
    notes: [...notes, ...resid.notes],
    requiresReview: requiresReview || resid.requiresReview,
    reliability: stampFromRules(conclusion, matched),
    matchedRules: matched
  };
}
