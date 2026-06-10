import { simulatePfVsPj } from "@tax-platform/rules";
import type { EntitySimulationInput } from "@tax-platform/shared";
import { prisma } from "../../db.js";
import { logDataChange } from "./data-change-log.js";

export async function createEntitySimulation(
  userId: string,
  taxYear: number,
  simulation: EntitySimulationInput,
  grossIncomeBrl: number
) {
  const result = simulatePfVsPj(grossIncomeBrl, simulation);
  const row = await prisma.entitySimulation.create({
    data: {
      userId,
      taxYear,
      scenarioName: simulation.scenarioName,
      proLaborePercent: simulation.proLaborePercent,
      profitDistributionPercent: simulation.profitDistributionPercent,
      estimatedOperatingCosts: simulation.estimatedOperatingCosts,
      estimatedEffectiveTaxRate: simulation.estimatedEffectiveTaxRate,
      entityCountry: simulation.entityCountry,
      pfTaxEstimate: result.pfTaxEstimate,
      pjTaxEstimate: result.pjTaxEstimate,
      savingsEstimate: result.savingsEstimate,
      currency: result.currency,
      requiresReview: result.requiresReview,
      ruleVersion: result.ruleVersion,
      notes: simulation.notes ?? null,
      dataOrigin: simulation.dataOrigin ?? "manual"
    }
  });
  await logDataChange(userId, taxYear, "EntitySimulation", row.id, "create", undefined, row);
  return { row, result };
}

export async function listEntitySimulations(userId: string, taxYear: number) {
  return prisma.entitySimulation.findMany({ where: { userId, taxYear }, orderBy: { createdAt: "desc" } });
}
