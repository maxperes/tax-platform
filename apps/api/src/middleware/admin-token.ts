import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

/** Requires `ADMIN_TOKEN` to be set and a matching `x-admin-token` header. */
export function adminTokenRequiredMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminToken) {
    res.status(503).json({ error: "Admin token not configured" });
    return;
  }
  const token = req.header("x-admin-token");
  if (token !== config.adminToken) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
