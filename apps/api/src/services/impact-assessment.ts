import { z } from "zod";
import {
  twinInventorySchema,
  twinPersonSchema,
  userPlanSchema,
  type TwinPersonInput,
  type UserPlan
} from "@tax-platform/shared";
import { buildImpactAssessmentReport } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { Prisma } from "../prisma-client.js";

const runSchema = z.object({
  twinCaseId: z.string().uuid(),
  hypothesisResidencyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  applyReliefs: z.boolean().optional()
});

export async function runImpactAssessment(userId: string, body: unknown) {
  const parsed = runSchema.parse(body);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true }
  });
  const plan = userPlanSchema.parse(user.plan);

  if (parsed.applyReliefs && plan !== "pro") {
    const err = new Error("Applying reliefs requires a Pro plan");
    (err as Error & { status: number }).status = 403;
    throw err;
  }

  const twin = await prisma.twinCase.findFirst({
    where: { id: parsed.twinCaseId, userId },
    include: { persons: true }
  });
  if (!twin) {
    const err = new Error("Twin case not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const inventory = twinInventorySchema.parse(twin.inventoryJson);
  const persons: TwinPersonInput[] = twin.persons.map((p) =>
    twinPersonSchema.parse({
      fullName: p.fullName,
      role: p.role,
      livesInCountry: p.livesInCountry ?? undefined,
      worksInCountry: p.worksInCountry ?? undefined,
      hasIncome: p.hasIncome ?? undefined,
      hasWealth: p.hasWealth ?? undefined,
      hasInvestments: p.hasInvestments ?? undefined,
      notes: p.notes ?? undefined
    })
  );

  const report = buildImpactAssessmentReport({
    inventory,
    persons,
    hypothesisResidencyDate: parsed.hypothesisResidencyDate,
    plan: plan as UserPlan,
    applyReliefs: parsed.applyReliefs ?? false
  });

  const saved = await prisma.impactAssessment.create({
    data: {
      userId,
      twinCaseId: twin.id,
      taxYear: twin.taxYear,
      hypothesisResidencyDate: new Date(`${parsed.hypothesisResidencyDate}T12:00:00.000Z`),
      applyReliefs: parsed.applyReliefs ?? false,
      title: report.title,
      summaryJson: {
        sections: report.sections,
        estimatedBrGrossTaxTotal: report.layers.brazilImpact.estimatedBrGrossTaxTotal,
        brazilianTaxTotal: report.layers.brazilImpact.brazilianTaxTotal,
        foreignTaxCreditTotal: report.layers.brazilImpact.foreignTaxCreditTotal,
        netPayableTotal: report.layers.brazilImpact.netPayableTotal,
        situationSummary: report.layers.brazilImpact.situationSummary,
        completionPercent: report.layers.currentStatus.completionPercent
      } as Prisma.InputJsonValue,
      asIsJson: report.layers.currentStatus as unknown as Prisma.InputJsonValue,
      toBeJson: report.layers.brazilImpact as unknown as Prisma.InputJsonValue,
      planningJson: report.layers.opportunities as unknown as Prisma.InputJsonValue,
      requiresAdditionalReview: report.requiresAdditionalReview,
      ruleVersion: report.ruleVersion,
      legalRulePackId: report.legalRulePackId
    }
  });

  return { assessment: saved, report };
}

export async function getImpactAssessment(userId: string, id: string) {
  return prisma.impactAssessment.findFirst({ where: { id, userId } });
}

export async function requestImpactReview(userId: string, assessmentId: string) {
  const existing = await prisma.impactAssessment.findFirst({
    where: { id: assessmentId, userId }
  });
  if (!existing) return null;
  return prisma.impactAssessment.update({
    where: { id: existing.id },
    data: { requiresAdditionalReview: true }
  });
}

export async function listImpactAssessments(userId: string, taxYear?: number) {
  return prisma.impactAssessment.findMany({
    where: { userId, ...(taxYear ? { taxYear } : {}) },
    orderBy: { createdAt: "desc" }
  });
}
