import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import {
  syncTaxableEvents,
  recomputeMonthlyTax,
  estimateAnnualTax,
  buildAndSaveReport
} from "../services/tax-pipeline.js";

export const taxOpsRouter = Router();
taxOpsRouter.use(authMiddleware);

taxOpsRouter.post(
  "/events/sync",
  asyncHandler(async (req, res) => {
    const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
    const n = await syncTaxableEvents(req.user!.sub, taxYear);
    res.json({ synced: n });
  })
);

taxOpsRouter.post(
  "/monthly-tax/recompute",
  asyncHandler(async (req, res) => {
    const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
    await recomputeMonthlyTax(req.user!.sub, taxYear);
    const rows = await prisma.monthlyTaxCalculation.findMany({
      where: { userId: req.user!.sub, taxYear },
      include: { items: true }
    });
    res.json(rows);
  })
);

taxOpsRouter.post(
  "/tax-calculation/estimate",
  asyncHandler(async (req, res) => {
    const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
    await estimateAnnualTax(req.user!.sub, taxYear);
    const rows = await prisma.taxCalculation.findMany({
      where: { userId: req.user!.sub, taxYear },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    res.json(rows);
  })
);

taxOpsRouter.post(
  "/report",
  asyncHandler(async (req, res) => {
    const { taxYear } = z.object({ taxYear: z.number().int() }).parse(req.body);
    const id = await buildAndSaveReport(req.user!.sub, taxYear);
    res.status(201).json({ id });
  })
);

/** Latest report for a tax year (must be registered before `/report/:id` so `latest` is not treated as an id). */
taxOpsRouter.get(
  "/report/latest",
  asyncHandler(async (req, res) => {
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
  })
);

taxOpsRouter.get(
  "/report/:id",
  asyncHandler(async (req, res) => {
    const report = await prisma.taxReport.findFirst({
      where: { id: String(req.params.id), userId: req.user!.sub },
      include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } }
    });
    if (!report) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(report);
  })
);

taxOpsRouter.get(
  "/report/:id/download.html",
  asyncHandler(async (req, res) => {
    const report = await prisma.taxReport.findFirst({
      where: { id: String(req.params.id), userId: req.user!.sub },
      include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } }
    });
    if (!report) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const summary = report.summaryJson as Record<string, unknown>;
    const sectionsHtml = report.sections
      .map(
        (s) =>
          `<section><h2>${escapeHtml(s.title)}</h2>${s.bodyMarkdown ? `<p>${escapeHtml(s.bodyMarkdown)}</p>` : ""}${s.items.map((it) => `<p><strong>${escapeHtml(it.label)}</strong>: ${escapeHtml(JSON.stringify(it.valueJson))}</p>`).join("")}</section>`
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem}h1,h2{color:#111}section{margin:1.5rem 0;border-top:1px solid #ddd;padding-top:1rem}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(report.title)}</h1><p>Tax year ${report.taxYear} · Generated ${report.createdAt.toISOString()}</p>${report.requiresAdditionalReview ? "<p><strong>Requires additional expert review.</strong></p>" : ""}${sectionsHtml}<p><em>${escapeHtml(String(summary.estimatesDisclaimer ?? ""))}</em></p></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tax-report-${report.taxYear}.html"`);
    res.send(html);
  })
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

taxOpsRouter.get(
  "/report/:id/download",
  asyncHandler(async (req, res) => {
    const report = await prisma.taxReport.findFirst({
      where: { id: String(req.params.id), userId: req.user!.sub }
    });
    if (!report) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="tax-report-${report.taxYear}.json"`);
    res.send(JSON.stringify(report, null, 2));
  })
);
