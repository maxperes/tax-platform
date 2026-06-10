import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { getDataChangeHistory } from "../services/persistence/data-change-log.js";

export const dataChangesRouter = Router();
dataChangesRouter.use(authMiddleware);

dataChangesRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await getDataChangeHistory(req.user!.sub, taxYear);
  res.json(rows);
}));
