import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { checkRulesFreshness } from "../services/rule-freshness.js";

export const taxRulesRouter = Router();
taxRulesRouter.use(authMiddleware);

/** Compare stored calculation stamps to the active rule pack + overrides. */
taxRulesRouter.get(
  "/freshness",
  asyncHandler(async (req, res) => {
    const taxYear = z.coerce.number().int().parse(req.query.taxYear);
    const result = await checkRulesFreshness(req.user!.sub, taxYear);
    res.json(result);
  })
);
