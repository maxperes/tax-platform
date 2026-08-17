import { randomUUID } from "node:crypto";
import { z } from "zod";
import { documentKindSchema, twinInventorySchema, brazilianTaxTreatmentSchema } from "@tax-platform/shared";
import { prisma } from "../db.js";
import { Prisma } from "../prisma-client.js";
import { extractFactsFromDocumentContent } from "./document-extract.js";
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
 * Does not OCR; user must confirm before Twin merge.
 */
export function proposeExtractedFacts(kind: z.infer<typeof documentKindSchema>, fileName: string) {
  const base = { sourceFileName: fileName, kind, proposedAt: new Date().toISOString() };
  if (kind === "passport") {
    return {
      ...base,
      suggestions: {
        residency: { notes: "Confirm nationality and identity from passport" },
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
    if (parsed) {
      extracted = {
        ...heuristic,
        sourceFileName: doc.originalFileName,
        kind,
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
      extracted = { ...heuristic, extractionSource: "filename_heuristic" };
    }
  } catch {
    extracted = { ...heuristic, extractionSource: "filename_heuristic" };
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
        };
      };
      const suggestions = facts.suggestions ?? {};
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
      await prisma.twinCase.update({
        where: { id: twin.id },
        data: { inventoryJson: inventory as Prisma.InputJsonValue }
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
