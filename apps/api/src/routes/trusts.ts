import { Router } from "express";
import { z } from "zod";
import { trustStructureSchema } from "@tax-platform/shared";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createTrustStructure, listTrustStructures } from "../services/persistence/trust-structure.js";

export const trustsRouter = Router();
trustsRouter.use(authMiddleware);

trustsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ taxYear: z.number().int(), trust: trustStructureSchema }).parse(req.body);
  const result = await createTrustStructure(req.user!.sub, body.taxYear, body.trust);
  res.status(201).json(result);
}));

trustsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await listTrustStructures(req.user!.sub, taxYear);
  res.json(rows);
}));
