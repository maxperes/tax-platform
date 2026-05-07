import { Router } from "express";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

export const meRouter = Router();
meRouter.use(authMiddleware);

meRouter.get("/profile", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, createdAt: true }
  });
  res.json(user);
});

meRouter.get("/fiscal-residence/:taxYear", async (req, res) => {
  const taxYear = Number(req.params.taxYear);
  const row = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId: req.user!.sub, taxYear } }
  });
  res.json(row ?? null);
});
