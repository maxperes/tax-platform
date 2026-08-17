import {
  twinCaseUpsertSchema,
  twinInventorySchema,
  twinPersonSchema,
  type TwinPersonInput
} from "@tax-platform/shared";
import { buildAsIsSnapshot } from "@tax-platform/rules";
import { prisma } from "../db.js";
import { Prisma } from "../prisma-client.js";

function mapPersons(
  persons: { fullName: string; role: string; livesInCountry: string | null; worksInCountry: string | null; hasIncome: boolean | null; hasWealth: boolean | null; hasInvestments: boolean | null; notes: string | null }[]
): TwinPersonInput[] {
  return persons.map((p) =>
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
}

export async function getOrCreateTwinCase(userId: string, taxYear: number) {
  const existing = await prisma.twinCase.findUnique({
    where: { userId_taxYear: { userId, taxYear } },
    include: { persons: true }
  });
  if (existing) {
    return {
      ...existing,
      asIs: buildAsIsSnapshot({ inventory: existing.inventoryJson, persons: mapPersons(existing.persons) })
    };
  }

  const empty = twinInventorySchema.parse({});
  const created = await prisma.twinCase.create({
    data: {
      userId,
      taxYear,
      inventoryJson: empty as Prisma.InputJsonValue,
      asIsCompletion: 0
    },
    include: { persons: true }
  });
  return {
    ...created,
    asIs: buildAsIsSnapshot({ inventory: empty, persons: [] })
  };
}

export async function listTwinCases(userId: string) {
  return prisma.twinCase.findMany({
    where: { userId },
    include: { persons: true },
    orderBy: { taxYear: "desc" }
  });
}

export async function upsertTwinCase(userId: string, body: unknown) {
  const parsed = twinCaseUpsertSchema.parse(body);
  const inventory = twinInventorySchema.parse(parsed.inventory ?? {});
  const persons = (parsed.persons ?? []).map((p) => twinPersonSchema.parse(p));
  const asIs = buildAsIsSnapshot({ inventory, persons });

  const row = await prisma.twinCase.upsert({
    where: { userId_taxYear: { userId, taxYear: parsed.taxYear } },
    create: {
      userId,
      taxYear: parsed.taxYear,
      title: parsed.title ?? "Family Tax Twin",
      inventoryJson: inventory as Prisma.InputJsonValue,
      interviewJson: (parsed.interview ?? undefined) as Prisma.InputJsonValue | undefined,
      asIsCompletion: asIs.completionPercent,
      persons: {
        create: persons.map((p) => ({
          fullName: p.fullName,
          role: p.role,
          livesInCountry: p.livesInCountry,
          worksInCountry: p.worksInCountry,
          hasIncome: p.hasIncome,
          hasWealth: p.hasWealth,
          hasInvestments: p.hasInvestments,
          notes: p.notes
        }))
      }
    },
    update: {
      title: parsed.title,
      inventoryJson: inventory as Prisma.InputJsonValue,
      interviewJson:
        parsed.interview !== undefined
          ? (parsed.interview as Prisma.InputJsonValue)
          : undefined,
      asIsCompletion: asIs.completionPercent
    },
    include: { persons: true }
  });

  if (parsed.persons) {
    await prisma.twinPerson.deleteMany({ where: { twinCaseId: row.id } });
    if (persons.length > 0) {
      await prisma.twinPerson.createMany({
        data: persons.map((p) => ({
          twinCaseId: row.id,
          fullName: p.fullName,
          role: p.role,
          livesInCountry: p.livesInCountry,
          worksInCountry: p.worksInCountry,
          hasIncome: p.hasIncome,
          hasWealth: p.hasWealth,
          hasInvestments: p.hasInvestments,
          notes: p.notes
        }))
      });
    }
  }

  const refreshed = await prisma.twinCase.findUniqueOrThrow({
    where: { id: row.id },
    include: { persons: true }
  });

  return {
    ...refreshed,
    asIs: buildAsIsSnapshot({
      inventory: refreshed.inventoryJson,
      persons: mapPersons(refreshed.persons)
    })
  };
}

export async function getTwinCase(userId: string, twinCaseId: string) {
  const row = await prisma.twinCase.findFirst({
    where: { id: twinCaseId, userId },
    include: {
      persons: true,
      documents: true,
      impactAssessments: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!row) return null;
  return {
    ...row,
    asIs: buildAsIsSnapshot({
      inventory: row.inventoryJson,
      persons: mapPersons(row.persons)
    })
  };
}
