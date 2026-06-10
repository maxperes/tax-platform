import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";

/** Requires an authenticated user with `isAdmin` set in the database. */
export async function requireAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.sub) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { isAdmin: true }
  });

  if (!user?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
