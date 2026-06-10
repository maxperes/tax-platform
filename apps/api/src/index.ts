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

const app = express();
app.set("etag", false);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/sessions", sessionsRouter);
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
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
