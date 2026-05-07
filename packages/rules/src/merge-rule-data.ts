import type { ProgressiveRow } from "./progressive.js";
import type { BrRulePack2026 } from "./data/br/2026.js";
import type { UsRulePack2026, UsBracketSlice } from "./data/us/2026.js";

/** Merge DB-driven JSON patches into the checked-in BR pack (shallow keys only). */
export function applyJsonPatchesToBrPack(base: BrRulePack2026, patches: { key: string; value: unknown }[]): BrRulePack2026 {
  let out: BrRulePack2026 = {
    ...base,
    monthly: [...base.monthly],
    annual: [...base.annual],
    capitalGainSlices: [...base.capitalGainSlices]
  };
  for (const p of patches) {
    if (p.key === "br.monthly" && Array.isArray(p.value)) {
      out = { ...out, monthly: p.value as ProgressiveRow[] };
    }
    if (p.key === "br.annual" && Array.isArray(p.value)) {
      out = { ...out, annual: p.value as ProgressiveRow[] };
    }
    if (p.key === "br.lei14754Rate" && typeof p.value === "number") {
      out = { ...out, lei14754Rate: p.value };
    }
  }
  return out;
}

export function applyJsonPatchesToUsPack(base: UsRulePack2026, patches: { key: string; value: unknown }[]): UsRulePack2026 {
  let out: UsRulePack2026 = {
    ...base,
    standardDeduction: { ...base.standardDeduction },
    brackets: {
      single: [...base.brackets.single],
      mfj: [...base.brackets.mfj],
      hoh: [...base.brackets.hoh]
    }
  };
  for (const p of patches) {
    if (p.key === "us.brackets.single" && Array.isArray(p.value)) {
      out = { ...out, brackets: { ...out.brackets, single: p.value as UsBracketSlice[] } };
    }
    if (p.key === "us.brackets.mfj" && Array.isArray(p.value)) {
      out = { ...out, brackets: { ...out.brackets, mfj: p.value as UsBracketSlice[] } };
    }
    if (p.key === "us.feieLimit" && typeof p.value === "number") {
      out = { ...out, feieLimit: p.value };
    }
  }
  return out;
}
