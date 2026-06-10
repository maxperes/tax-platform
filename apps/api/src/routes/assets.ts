import { Router } from "express";
import { z } from "zod";
import { assetSchema } from "@tax-platform/shared";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createAsset, listAssets } from "../services/persistence/asset.js";

export const assetsRouter = Router();
assetsRouter.use(authMiddleware);

assetsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ taxYear: z.number().int(), asset: assetSchema }).parse(req.body);
  const result = await createAsset(req.user!.sub, body.taxYear, body.asset);
  res.status(201).json(result);
}));

assetsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await listAssets(req.user!.sub, taxYear);
  res.json(rows);
}));
