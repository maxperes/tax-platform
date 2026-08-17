import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { getJobStatus } from "../services/jobs/queue.js";

export const jobsRouter = Router();
jobsRouter.use(authMiddleware);

jobsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const status = await getJobStatus(String(req.params.id));
    if (!status) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(status);
  })
);
