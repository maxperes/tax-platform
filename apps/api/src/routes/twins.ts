import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { getOrCreateTwinCase, getTwinCase, listTwinCases, upsertTwinCase } from "../services/twin.js";

export const twinsRouter = Router();
twinsRouter.use(authMiddleware);

twinsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rows = await listTwinCases(req.user!.sub);
    res.json(rows);
  })
);

twinsRouter.post(
  "/ensure",
  asyncHandler(async (req, res) => {
    const body = z.object({ taxYear: z.number().int() }).parse(req.body);
    const twin = await getOrCreateTwinCase(req.user!.sub, body.taxYear);
    res.json(twin);
  })
);

twinsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const twin = await upsertTwinCase(req.user!.sub, req.body);
    res.json(twin);
  })
);

twinsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const twin = await getTwinCase(req.user!.sub, String(req.params.id));
    if (!twin) {
      res.status(404).json({ error: "Twin case not found" });
      return;
    }
    res.json(twin);
  })
);
