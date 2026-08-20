import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  documentKindSchema,
  twinInventorySchema,
  brazilianTaxTreatmentSchema,
  syncBrazilStaysToInterviewAnswers,
  brazilStaySchema,
  parseInterviewRecord,
  type InterviewRecord
} from "@tax-platform/shared";
import { prisma } from "../db.js";
import { Prisma } from "../prisma-client.js";
import { extractFactsFromDocumentContent } from "./document-extract.js";
import { extractBrazilStaysFromPassportImage } from "./passport-vision.js";
import { putObject, readObject } from "./object-storage.js";
import { enqueueJob, JOB_NAMES } from "./jobs/queue.js";

const metaSchema = z.object({
  taxYear: z.coerce.number().int(),
  kind: documentKindSchema,
  twinCaseId: z.string().uuid().optional(),
  originalFileName: z.string().min(1),
  mimeType: z.string().optional(),
  /** Optional client-provided extraction hints (MVP); otherwise heuristic from filename/kind. */
  extractedFacts: z.record(z.unknown()).optional()
});

/**
 * Heuristic extract-and-confirm: proposes facts from document kind + filename.
 * Passport images may also run vision extraction in the background worker.
 */
export function proposeExtractedFacts(kind: z.infer<typeof documentKindSchema>, fileName: string) {
  const base = { sourceFileName: fileName, kind, proposedAt: new Date().toISOString() };
  if (kind === "passport") {
    return {
      ...base,
      status: "pending",
      suggestions: {
        residency: {
          notes: "Upload a passport stamp photo to propose Brazil entry and exit dates — confirm before saving."
        },
        countryFootprint: [] as unknown[]
      }
    };
  }
  if (kind === "us_tax_return") {
    return {
      ...base,
      suggestions: {
        incomes: [
          {
            category: "salary",
            originCountry: "US",
            currency: "USD",
            annualAmount: 0,
            notes: `Extracted placeholder from ${fileName} — confirm amounts from Form 1040`
          }
        ]
      }
    };
  }
  if (kind === "bank_statement") {
    return {
      ...base,
      suggestions: {
        financialAccountsSummary: [fileName.replace(/\.[^.]+$/, "")],
        notes: "Confirm institution and balances from statement"
      }
    };
  }
  return { ...base, suggestions: {} };
}

export async function storeDocument(
  userId: string,
  meta: unknown,
  fileBuffer: Buffer
) {
  const parsed = metaSchema.parse(meta);
  const safeName = parsed.originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectKey = `documents/${userId}/${randomUUID()}-${safeName}`;
  const { storageKey } = await putObject(objectKey, fileBuffer, parsed.mimeType);

  const extracted =
    parsed.extractedFacts ??
    ({ status: "pending", sourceFileName: parsed.originalFileName, kind: parsed.kind } as Record<
      string,
      unknown
    >);

  const doc = await prisma.document.create({
    data: {
      userId,
      twinCaseId: parsed.twinCaseId,
      taxYear: parsed.taxYear,
      kind: parsed.kind,
      originalFileName: parsed.originalFileName,
      storagePath: storageKey,
      mimeType: parsed.mimeType,
      extractedFactsJson: extracted as Prisma.InputJsonValue,
      confirmed: false
    }
  });

  if (!parsed.extractedFacts) {
    await enqueueJob(JOB_NAMES.extractDocument, { documentId: doc.id, userId });
  }

  return doc;
}

/** Worker: parse document bytes when possible; otherwise filename/kind heuristics. */
export async function runDocumentExtraction(userId: string, documentId: string) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (!doc) throw new Error("Document not found");
  const kind = documentKindSchema.parse(doc.kind);
  const heuristic = proposeExtractedFacts(kind, doc.originalFileName);
  let extracted: Record<string, unknown> = heuristic;
  try {
    const bytes = await readObject(doc.storagePath);
    const parsed = extractFactsFromDocumentContent(bytes, doc.originalFileName);
    if (kind === "passport") {
      const vision = await extractBrazilStaysFromPassportImage(
        bytes,
        doc.originalFileName,
        doc.mimeType ?? undefined
      );
      extracted = {
        ...heuristic,
        sourceFileName: doc.originalFileName,
        kind,
        status: "complete",
        extractionSource: vision.extractionSource,
        suggestions: {
          ...(typeof heuristic.suggestions === "object" ? heuristic.suggestions : {}),
          residency: {
            brazilStays: vision.brazilStays,
            notes: vision.notes ?? "Confirm Brazil entry and exit dates before saving."
          }
        }
      };
    } else if (parsed) {
      extracted = {
        ...heuristic,
        sourceFileName: doc.originalFileName,
        kind,
        status: "complete",
        extractionSource: parsed.source,
        suggestions: {
          ...(typeof heuristic.suggestions === "object" ? heuristic.suggestions : {}),
          ...parsed.suggestions,
          incomes:
            parsed.suggestions.incomes && parsed.suggestions.incomes.length > 0
              ? parsed.suggestions.incomes
              : (heuristic.suggestions as { incomes?: unknown[] }).incomes
        }
      };
    } else {
      extracted = { ...heuristic, status: "complete", extractionSource: "filename_heuristic" };
    }
  } catch {
    extracted = { ...heuristic, status: "complete", extractionSource: "filename_heuristic" };
  }
  await prisma.document.update({
    where: { id: doc.id },
    data: { extractedFactsJson: extracted as Prisma.InputJsonValue }
  });
  return { documentId: doc.id, extracted };
}

export async function listDocuments(userId: string, taxYear?: number) {
  return prisma.document.findMany({
    where: { userId, ...(taxYear ? { taxYear } : {}) },
    orderBy: { createdAt: "desc" }
  });
}

function mergeConfirmedBrazilStays(
  inventoryResidency: { brazilStays?: z.infer<typeof brazilStaySchema>[] },
  stays: z.infer<typeof brazilStaySchema>[]
): void {
  const normalized = stays
    .map((s) => brazilStaySchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data);
  if (normalized.length === 0) return;
  const existing = inventoryResidency.brazilStays ?? [];
  const merged = [...existing];
  for (const stay of normalized) {
    const duplicate = merged.some(
      (s) => s.entryDate === stay.entryDate && (s.exitDate ?? "") === (stay.exitDate ?? "")
    );
    if (!duplicate) merged.push(stay);
  }
  merged.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  inventoryResidency.brazilStays = merged;
}

function mergeStaysIntoInterview(
  interview: InterviewRecord,
  stays: z.infer<typeof brazilStaySchema>[]
): InterviewRecord {
  const normalized = stays
    .map((s) => brazilStaySchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data);
  if (normalized.length === 0) return interview;

  const currentlyInBrazil = interview.answers.currently_in_brazil === "yes";
  const patch = syncBrazilStaysToInterviewAnswers(normalized, currentlyInBrazil);
  return {
    ...interview,
    answers: { ...interview.answers, ...patch }
  };
}

export async function confirmDocument(userId: string, documentId: string, mergeIntoTwin: boolean) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (!doc) {
    const err = new Error("Document not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { confirmed: true, confirmedAt: new Date() }
  });

  if (mergeIntoTwin && doc.twinCaseId && doc.extractedFactsJson) {
    const twin = await prisma.twinCase.findFirst({
      where: { id: doc.twinCaseId, userId }
    });
    if (twin) {
      const inventory = twinInventorySchema.parse(twin.inventoryJson);
      const facts = doc.extractedFactsJson as {
        suggestions?: {
          incomes?: TwinIncomeLike[];
          financialAccountsSummary?: string[];
          notes?: string;
          residency?: {
            brazilStays?: z.infer<typeof brazilStaySchema>[];
            notes?: string;
          };
        };
      };
      const suggestions = facts.suggestions ?? {};

      if (suggestions.residency?.brazilStays?.length) {
        mergeConfirmedBrazilStays(inventory.residency, suggestions.residency.brazilStays);
        if (suggestions.residency.notes) {
          inventory.notes = [inventory.notes, suggestions.residency.notes].filter(Boolean).join("\n");
        }
      }

      if (suggestions.incomes?.length) {
        inventory.incomes.push(
          ...suggestions.incomes.map((i) => {
            const treatment = brazilianTaxTreatmentSchema.safeParse(i.brazilianTaxTreatment);
            return {
              category: i.category ?? "other",
              originCountry: i.originCountry ?? "US",
              currency: i.currency ?? "USD",
              annualAmount: Number(i.annualAmount ?? 0),
              taxPaidOrigin: i.taxPaidOrigin,
              withholdingTax: i.withholdingTax,
              paymentDate: i.paymentDate,
              brazilianTaxTreatment: treatment.success ? treatment.data : undefined,
              notes: i.notes
            };
          })
        );
      }
      if (suggestions.financialAccountsSummary?.length) {
        inventory.financialAccountsSummary = [
          ...new Set([...inventory.financialAccountsSummary, ...suggestions.financialAccountsSummary])
        ];
      }
      if (suggestions.notes) {
        inventory.notes = [inventory.notes, suggestions.notes].filter(Boolean).join("\n");
      }

      const updateData: Prisma.TwinCaseUpdateInput = {
        inventoryJson: inventory as Prisma.InputJsonValue
      };
      if (suggestions.residency?.brazilStays?.length) {
        const interview = parseInterviewRecord(twin.interviewJson);
        const mergedInterview = mergeStaysIntoInterview(interview, suggestions.residency.brazilStays);
        updateData.interviewJson = mergedInterview as unknown as Prisma.InputJsonValue;
      }

      await prisma.twinCase.update({
        where: { id: twin.id },
        data: updateData
      });
    }
  }

  return updated;
}

type TwinIncomeLike = {
  category?: string;
  originCountry?: string;
  currency?: string;
  annualAmount?: number;
  taxPaidOrigin?: number;
  withholdingTax?: number;
  paymentDate?: string;
  brazilianTaxTreatment?: string;
  notes?: string;
};
