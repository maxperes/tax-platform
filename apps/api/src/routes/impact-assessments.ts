import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  getImpactAssessment,
  listImpactAssessments,
  requestImpactReview,
  runImpactAssessment
} from "../services/impact-assessment.js";

export const impactAssessmentsRouter = Router();
impactAssessmentsRouter.use(authMiddleware);

impactAssessmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const taxYear = req.query.taxYear ? z.coerce.number().int().parse(req.query.taxYear) : undefined;
    const rows = await listImpactAssessments(req.user!.sub, taxYear);
    res.json(rows);
  })
);

impactAssessmentsRouter.post(
  "/run",
  asyncHandler(async (req, res) => {
    try {
      const result = await runImpactAssessment(req.user!.sub, req.body);
      res.status(201).json(result);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 403 || status === 404) {
        res.status(status).json({ error: (err as Error).message });
        return;
      }
      throw err;
    }
  })
);

impactAssessmentsRouter.post(
  "/:id/request-review",
  asyncHandler(async (req, res) => {
    const row = await requestImpactReview(req.user!.sub, String(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    res.json(row);
  })
);

impactAssessmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await getImpactAssessment(req.user!.sub, String(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Assessment not found" });
      return;
    }
    res.json(row);
  })
);
