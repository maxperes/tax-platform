import { Router } from "express";
import { getNormativeMonitorStatus } from "@tax-platform/rules";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const normativeMonitorRouter = Router();
normativeMonitorRouter.use(authMiddleware);

normativeMonitorRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(getNormativeMonitorStatus());
  })
);
