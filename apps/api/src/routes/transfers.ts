import { Router } from "express";
import { z } from "zod";
import { internationalTransferSchema } from "@tax-platform/shared";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  createInternationalTransfer,
  listInternationalTransfers
} from "../services/persistence/international-transfer.js";

export const transfersRouter = Router();
transfersRouter.use(authMiddleware);

transfersRouter.post("/", asyncHandler(async (req, res) => {
  const body = z
    .object({ taxYear: z.number().int(), transfer: internationalTransferSchema })
    .parse(req.body);
  const result = await createInternationalTransfer(req.user!.sub, body.taxYear, body.transfer);
  res.status(201).json(result);
}));

transfersRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await listInternationalTransfers(req.user!.sub, taxYear);
  res.json(rows);
}));
