import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  syncTaxableEvents,
  recomputeMonthlyTax,
  estimateAnnualTax,
  buildAndSaveReport
} from "../services/orchestrator.js";

export const taxOpsRouter = Router();
taxOpsRouter.use(authMiddleware);

taxOpsRouter.post("/events/sync", async (req, res) => {
  const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
  const n = await syncTaxableEvents(req.user!.sub, taxYear);
  res.json({ synced: n });
});

taxOpsRouter.post("/monthly-tax/recompute", async (req, res) => {
  const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
  await recomputeMonthlyTax(req.user!.sub, taxYear);
  const rows = await prisma.monthlyTaxCalculation.findMany({
    where: { userId: req.user!.sub, taxYear },
    include: { items: true }
  });
  res.json(rows);
});

taxOpsRouter.post("/tax-calculation/estimate", async (req, res) => {
  const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
  await estimateAnnualTax(req.user!.sub, taxYear);
  const rows = await prisma.taxCalculation.findMany({
    where: { userId: req.user!.sub, taxYear },
    orderBy: { createdAt: "desc" },
    take: 5
  });
  res.json(rows);
});

taxOpsRouter.post("/report", async (req, res) => {
  const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
  const id = await buildAndSaveReport(req.user!.sub, taxYear);
  res.status(201).json({ id });
});

/** Latest report for a tax year (must be registered before `/report/:id` so `latest` is not treated as an id). */
taxOpsRouter.get("/report/latest", async (req, res) => {
  const taxYear = z.coerce.number().int().parse(req.query.taxYear);
  const report = await prisma.taxReport.findFirst({
    where: { userId: req.user!.sub, taxYear },
    orderBy: { createdAt: "desc" },
    select: { id: true, taxYear: true, title: true, createdAt: true, ruleVersion: true }
  });
  if (!report) {
    res.status(404).json({ error: "No report for this tax year yet" });
    return;
  }
  res.json(report);
});

taxOpsRouter.get("/report/:id", async (req, res) => {
  const report = await prisma.taxReport.findFirst({
    where: { id: req.params.id, userId: req.user!.sub }
  });
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(report);
});

taxOpsRouter.get("/report/:id/download", async (req, res) => {
  const report = await prisma.taxReport.findFirst({
    where: { id: req.params.id, userId: req.user!.sub }
  });
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="tax-report-${report.taxYear}.json"`);
  res.send(JSON.stringify(report, null, 2));
});
