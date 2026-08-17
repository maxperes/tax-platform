import "./types/express.js";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { ZodError } from "zod";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { sessionsRouter } from "./routes/sessions.js";
import { incomesRouter } from "./routes/incomes.js";
import { deductionsRouter } from "./routes/deductions.js";
import { capitalGainsRouter } from "./routes/capital-gains.js";
import { assetsRouter } from "./routes/assets.js";
import { transfersRouter } from "./routes/transfers.js";
import { trustsRouter } from "./routes/trusts.js";
import { entitySimulationsRouter } from "./routes/entity-simulations.js";
import { exemptionsRouter } from "./routes/exemptions.js";
import { dataChangesRouter } from "./routes/data-changes.js";
import { taxOpsRouter } from "./routes/tax-ops.js";
import { taxRulesRouter } from "./routes/tax-rules.js";
import { meRouter } from "./routes/me.js";
import { adminRouter } from "./routes/admin.js";
import { twinsRouter } from "./routes/twins.js";
import { impactAssessmentsRouter } from "./routes/impact-assessments.js";
import { documentsRouter } from "./routes/documents.js";
import { normativeMonitorRouter } from "./routes/normative-monitor.js";
import { jobsRouter } from "./routes/jobs.js";
import { authRateLimit } from "./middleware/rate-limit.js";
import { initRedis, isRedisConfigured, redisHealthCheck } from "./services/redis.js";
import { startJobWorkers } from "./services/jobs/queue.js";
import { logger } from "./services/logger.js";
import { getMetricsSnapshot, metricsPrometheusText } from "./services/metrics.js";
import { objectStorageMode } from "./services/object-storage.js";
import { prisma } from "./db.js";
import { LlmAdmissionError } from "./services/llm-admission.js";

await initRedis();
if (config.runWorkersInProcess) {
  startJobWorkers();
}

const app = express();
app.set("etag", false);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "12mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/ready", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  checks.redis = await redisHealthCheck();
  checks.objectStorage = objectStorageMode();
  const ok = checks.database === "ok" && (checks.redis === "ok" || checks.redis === "skipped");
  res.status(ok ? 200 : 503).json({ ok, checks });
});

app.get("/metrics", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(metricsPrometheusText());
});

app.get("/api/ops/status", (_req, res) => {
  res.json({
    ok: true,
    redisConfigured: isRedisConfigured(),
    objectStorage: objectStorageMode(),
    llmEnabled: config.llmEnabled,
    llmMaxInFlight: config.llmMaxInFlight,
    workersInProcess: config.runWorkersInProcess,
    metrics: getMetricsSnapshot()
  });
});

app.use("/api/auth", authRateLimit, authRouter);
app.use("/api/me", meRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/incomes", incomesRouter);
app.use("/api/deductions", deductionsRouter);
app.use("/api/capital-gains", capitalGainsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/trusts", trustsRouter);
app.use("/api/entity-simulations", entitySimulationsRouter);
app.use("/api/exemptions", exemptionsRouter);
app.use("/api/data-changes", dataChangesRouter);
app.use("/api/tax-rules", taxRulesRouter);
app.use("/api/twins", twinsRouter);
app.use("/api/impact-assessments", impactAssessmentsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/normative-monitor", normativeMonitorRouter);
app.use("/api", taxOpsRouter);
app.use("/api/admin", adminRouter);

const webDist = config.webDist ? path.resolve(config.webDist) : "";
if (webDist && fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    if (req.method !== "GET") {
      next();
      return;
    }
    res.set("Cache-Control", "no-store, private");
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  if (err instanceof LlmAdmissionError) {
    res.setHeader("Retry-After", String(err.retryAfterSeconds));
    res.status(429).json({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
    return;
  }
  logger.error("unhandled_error", { error: String(err) });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  logger.info("api_listening", {
    port: config.port,
    redis: isRedisConfigured(),
    objectStorage: objectStorageMode(),
    workersInProcess: config.runWorkersInProcess
  });
});
