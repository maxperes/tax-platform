import { Router } from "express";
import { z } from "zod";
import { entitySimulationSchema } from "@tax-platform/shared";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  createEntitySimulation,
  listEntitySimulations
} from "../services/persistence/entity-simulation.js";

export const entitySimulationsRouter = Router();
entitySimulationsRouter.use(authMiddleware);

entitySimulationsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z
    .object({
      taxYear: z.number().int(),
      simulation: entitySimulationSchema,
      grossIncomeBrl: z.number().nonnegative()
    })
    .parse(req.body);
  const result = await createEntitySimulation(
    req.user!.sub,
    body.taxYear,
    body.simulation,
    body.grossIncomeBrl
  );
  res.status(201).json(result);
}));

entitySimulationsRouter.get("/", asyncHandler(async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const rows = await listEntitySimulations(req.user!.sub, taxYear);
  res.json(rows);
}));
