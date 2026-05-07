import type { CapitalGainCalculationInput } from "@tax-platform/shared";
import { computeCapitalGainBr } from "./engines/br.js";
import { computeCapitalGainUs } from "./engines/us.js";
import type { CapitalGainResult } from "./engines/br.js";

export type { CapitalGainResult };

/** Compute capital gain tax under BR or US data packs (see `packages/rules/src/data/`). */
export function computeCapitalGain(
  input: CapitalGainCalculationInput,
  jurisdiction: "BR" | "US" = "BR"
): CapitalGainResult {
  return jurisdiction === "US" ? computeCapitalGainUs(input) : computeCapitalGainBr(input);
}
