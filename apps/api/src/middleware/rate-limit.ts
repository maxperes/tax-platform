import type { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "../config.js";
import { incrWithTtl } from "../services/redis.js";
import { incrMetric } from "../services/metrics.js";

type RateLimitOptions = {
  prefix: string;
  max: number;
  windowSeconds: number;
  keyFn: (req: Request) => string;
};

export function createRateLimitMiddleware(opts: RateLimitOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = opts.keyFn(req);
      const key = `rl:${opts.prefix}:${id}`;
      const count = await incrWithTtl(key, opts.windowSeconds);
      res.setHeader("X-RateLimit-Limit", String(opts.max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));
      if (count > opts.max) {
        incrMetric("rate_limit_rejected");
        res.setHeader("Retry-After", String(opts.windowSeconds));
        res.status(429).json({
          error: "Too many requests",
          retryAfterSeconds: opts.windowSeconds
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authRateLimit = createRateLimitMiddleware({
  prefix: "auth",
  max: config.rateLimitAuthMax,
  windowSeconds: config.rateLimitAuthWindowSeconds,
  keyFn: (req) => req.ip || "unknown"
});

export const chatRateLimit = createRateLimitMiddleware({
  prefix: "chat",
  max: config.rateLimitChatMax,
  windowSeconds: config.rateLimitChatWindowSeconds,
  keyFn: (req) => req.user?.sub || req.ip || "unknown"
});
