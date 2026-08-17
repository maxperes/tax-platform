import type { TwinInventory, TwinPersonInput, AsIsCompletionModule } from "@tax-platform/shared";
import { AS_IS_COMPLETION_MODULES, twinInventorySchema } from "@tax-platform/shared";

export type AsIsSnapshot = {
  inventory: TwinInventory;
  persons: TwinPersonInput[];
  moduleCompletion: Record<AsIsCompletionModule, boolean>;
  completionPercent: number;
  /** Layer 1 never includes recommendations. */
  recommendations: [];
};

/**
 * Facts Engine — builds the As Is photography from Twin inventory.
 * Does not apply legal conclusions or planning advice.
 */
export function buildAsIsSnapshot(input: {
  inventory: unknown;
  persons?: TwinPersonInput[];
}): AsIsSnapshot {
  const inventory = twinInventorySchema.parse(input.inventory ?? {});
  const persons = input.persons ?? [];

  const moduleCompletion: Record<AsIsCompletionModule, boolean> = {
    residency: Boolean(
      inventory.residency.firstEntryBrazilDate ||
        inventory.residency.entryPathway ||
        (inventory.residency.brazilStays && inventory.residency.brazilStays.length > 0) ||
        inventory.residency.currentlyFiscalResidentBrazil !== undefined ||
        inventory.residency.currentlyFiscalResidentUSA !== undefined
    ),
    countries: inventory.countryFootprint.length > 0,
    family: persons.length > 0,
    incomes: inventory.incomes.length > 0,
    assets: inventory.assets.length > 0,
    entities: inventory.entities.length > 0,
    trusts: inventory.trusts.length > 0,
    accounts: inventory.financialAccountsSummary.length > 0
  };

  const done = AS_IS_COMPLETION_MODULES.filter((m) => moduleCompletion[m]).length;
  const completionPercent = Math.round((done / AS_IS_COMPLETION_MODULES.length) * 100);

  return {
    inventory,
    persons,
    moduleCompletion,
    completionPercent,
    recommendations: []
  };
}
