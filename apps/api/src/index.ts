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
import { taxOpsRouter } from "./routes/tax-ops.js";
import { meRouter } from "./routes/me.js";
import { adminRouter } from "./routes/admin.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/incomes", incomesRouter);
app.use("/api/deductions", deductionsRouter);
app.use("/api/capital-gains", capitalGainsRouter);
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
