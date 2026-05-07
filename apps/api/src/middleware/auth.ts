import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthPayload } from "../types/auth.js";

export type { AuthPayload } from "../types/auth.js";

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
