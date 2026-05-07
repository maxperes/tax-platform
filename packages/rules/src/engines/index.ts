import type { FiscalProfile } from "@tax-platform/shared";
import { brRulePack2026 } from "../data/br/2026.js";
import { usRulePack2026 } from "../data/us/2026.js";
import type { BrRulePack2026 } from "../data/br/2026.js";
import type { UsRulePack2026 } from "../data/us/2026.js";
import { applyJsonPatchesToBrPack, applyJsonPatchesToUsPack } from "../merge-rule-data.js";

export type JurisdictionCode = "BR" | "US";

export function jurisdictionsForProfile(profile: FiscalProfile): JurisdictionCode[] {
  if (profile === "dual_residence") return ["BR", "US"];
  if (profile === "resident_brazil") return ["BR"];
  if (profile === "resident_usa") return ["US"];
  if (profile === "non_resident_brazil") return ["BR"];
  return ["BR"];
}

export function getBrRulePack(patches?: { key: string; value: unknown }[]): BrRulePack2026 {
  if (!patches?.length) return brRulePack2026;
  return applyJsonPatchesToBrPack(brRulePack2026, patches);
}

export function getUsRulePack(patches?: { key: string; value: unknown }[]): UsRulePack2026 {
  if (!patches?.length) return usRulePack2026;
  return applyJsonPatchesToUsPack(usRulePack2026, patches);
}

export * from "./br.js";
export * from "./us.js";
