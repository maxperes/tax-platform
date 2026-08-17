import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { confirmDocument, listDocuments, storeDocument } from "../services/documents.js";

export const documentsRouter = Router();
documentsRouter.use(authMiddleware);

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const taxYear = req.query.taxYear ? z.coerce.number().int().parse(req.query.taxYear) : undefined;
    res.json(await listDocuments(req.user!.sub, taxYear));
  })
);

/**
 * JSON upload MVP: { taxYear, kind, twinCaseId?, originalFileName, mimeType?, contentBase64, extractedFacts? }
 */
documentsRouter.post(
  "/upload",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        taxYear: z.number().int(),
        kind: z.enum(["passport", "bank_statement", "us_tax_return", "other"]),
        twinCaseId: z.string().uuid().optional(),
        originalFileName: z.string().min(1),
        mimeType: z.string().optional(),
        contentBase64: z.string().min(1),
        extractedFacts: z.record(z.unknown()).optional()
      })
      .parse(req.body);

    const buffer = Buffer.from(body.contentBase64, "base64");
    if (buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: "File too large (max 8MB)" });
      return;
    }

    const doc = await storeDocument(
      req.user!.sub,
      {
        taxYear: body.taxYear,
        kind: body.kind,
        twinCaseId: body.twinCaseId,
        originalFileName: body.originalFileName,
        mimeType: body.mimeType,
        extractedFacts: body.extractedFacts
      },
      buffer
    );
    res.status(201).json(doc);
  })
);

documentsRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const body = z.object({ mergeIntoTwin: z.boolean().default(true) }).parse(req.body ?? {});
    try {
      const doc = await confirmDocument(req.user!.sub, String(req.params.id), body.mergeIntoTwin);
      res.json(doc);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        res.status(404).json({ error: (err as Error).message });
        return;
      }
      throw err;
    }
  })
);
