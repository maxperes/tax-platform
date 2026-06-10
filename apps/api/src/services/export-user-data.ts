import { Prisma } from "../prisma-client.js";
import { prisma } from "../db.js";
import { config } from "../config.js";

function serializeForExport(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForExport);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeForExport(nested);
    }
    return out;
  }
  return value;
}

export async function buildUserDataExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
      fiscalProfiles: true,
      conversationSessions: {
        include: { messages: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" }
      },
      incomeSources: { orderBy: { createdAt: "asc" } },
      taxableEvents: { orderBy: { createdAt: "asc" } },
      deductions: { orderBy: { createdAt: "asc" } },
      capitalGainCalcs: { orderBy: { createdAt: "asc" } },
      monthlyCalcs: {
        include: { items: { orderBy: { createdAt: "asc" } } },
        orderBy: [{ taxYear: "asc" }, { taxMonth: "asc" }]
      },
      taxCalculations: { orderBy: { createdAt: "asc" } },
      taxReports: {
        include: {
          sections: {
            include: { items: true },
            orderBy: { sortOrder: "asc" }
          }
        },
        orderBy: { createdAt: "asc" }
      },
      consentRecords: { orderBy: { grantedAt: "asc" } }
    }
  });

  if (!user) {
    return null;
  }

  return serializeForExport({
    exportedAt: new Date().toISOString(),
    policyVersion: config.privacyPolicyVersion,
    user
  });
}

export function formatUserDataExportJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}
