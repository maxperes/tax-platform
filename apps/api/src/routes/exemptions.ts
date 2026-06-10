import { Router } from "express";
import { z } from "zod";
import { exemptionSchema } from "@tax-platform/shared";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createExemption, listExemptions } from "../services/persistence/exemption.js";

export const exemptionsRouter = Router();
exemptionsRouter.use(authMiddleware);

exemptionsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ taxYear: z.number().int(), exemption: exemptionSchema }).parse(req.body);
  const result = await createExemption(req.user!.sub, body.taxYear, body.exemption);
  res.status(201).json(result);
}));

exemptionsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await listExemptions(req.user!.sub, taxYear);
  res.json(rows);
}));
