import { Router } from "express";
import { z } from "zod";
import { capitalGainCalculationSchema } from "@tax-platform/shared";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { createCapitalGainCalculation } from "../services/persistence/capital-gain.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const capitalGainsRouter = Router();
capitalGainsRouter.use(authMiddleware);

capitalGainsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      capitalGain: capitalGainCalculationSchema
    })
    .parse(req.body);
  const { row, result } = await createCapitalGainCalculation(
    req.user!.sub,
    body.taxYear,
    body.capitalGain
  );
  res.status(201).json({ row, result });
}));

capitalGainsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await prisma.capitalGainCalculation.findMany({
    where: { userId: req.user!.sub, taxYear }
  });
  res.json(rows);
}));
