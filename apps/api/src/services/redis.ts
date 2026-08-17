import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

let redis: Redis | null = null;
let redisReady = false;
let memoryFallbackWarned = false;

/** In-memory fallback for local/dev when REDIS_URL is unset or Redis is down. Not safe across replicas. */
const memoryStore = new Map<string, { value: string; expiresAt?: number }>();

function memoryGet(key: string): string | null {
  const row = memoryStore.get(key);
  if (!row) return null;
  if (row.expiresAt && Date.now() > row.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return row.value;
}

function memorySet(key: string, value: string, ttlSeconds?: number): void {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
  });
}

function memoryIncr(key: string, ttlSeconds?: number): number {
  const cur = Number(memoryGet(key) ?? "0") + 1;
  const existing = memoryStore.get(key);
  const expiresAt =
    existing?.expiresAt ?? (ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined);
  memoryStore.set(key, { value: String(cur), expiresAt });
  return cur;
}

export function isRedisConfigured(): boolean {
  return Boolean(config.redisUrl);
}

export function isRedisReady(): boolean {
  return redisReady;
}

export function getRedis(): Redis | null {
  return redis;
}

export async function initRedis(): Promise<void> {
  if (!config.redisUrl) {
    if (!memoryFallbackWarned) {
      memoryFallbackWarned = true;
      logger.warn("REDIS_URL unset; using in-process memory for admission/rate-limits (not horizontal-safe)");
    }
    return;
  }
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true
  });
  redis.on("error", (err: Error) => {
    redisReady = false;
    logger.error("redis_error", { error: String(err) });
  });
  redis.on("ready", () => {
    redisReady = true;
    logger.info("redis_ready");
  });
  try {
    await redis.connect();
    redisReady = true;
  } catch (err) {
    logger.error("redis_connect_failed", { error: String(err) });
    redisReady = false;
  }
}

export async function redisHealthCheck(): Promise<"ok" | "skipped" | "error"> {
  if (!config.redisUrl) return "skipped";
  if (!redis) return "error";
  try {
    const pong = await redis.ping();
    return pong === "PONG" ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** Cluster-safe INCR with TTL on first hit. Falls back to memory. */
export async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  if (redis && redisReady) {
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, ttlSeconds, "NX");
    const results = await multi.exec();
    const incrResult = results?.[0]?.[1];
    return typeof incrResult === "number" ? incrResult : Number(incrResult);
  }
  return memoryIncr(key, ttlSeconds);
}

export async function getString(key: string): Promise<string | null> {
  if (redis && redisReady) return redis.get(key);
  return memoryGet(key);
}

export async function setString(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (redis && redisReady) {
    if (ttlSeconds) await redis.set(key, value, "EX", ttlSeconds);
    else await redis.set(key, value);
    return;
  }
  memorySet(key, value, ttlSeconds);
}

export async function delKey(key: string): Promise<void> {
  if (redis && redisReady) {
    await redis.del(key);
    return;
  }
  memoryStore.delete(key);
}

/**
 * Acquire a slot in a concurrency semaphore (max concurrent holders).
 * Returns a release function, or null if capacity is full.
 */
export async function acquireSemaphore(
  key: string,
  max: number,
  ttlSeconds: number
): Promise<(() => Promise<void>) | null> {
  const slotId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const holderKey = `${key}:holder:${slotId}`;

  if (redis && redisReady) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSeconds);
    if (count > max) {
      await redis.decr(key);
      return null;
    }
    await redis.set(holderKey, "1", "EX", ttlSeconds);
    return async () => {
      try {
        await redis!.del(holderKey);
        await redis!.decr(key);
      } catch (err) {
        logger.warn("semaphore_release_failed", { error: String(err) });
      }
    };
  }

  const cur = Number(memoryGet(key) ?? "0");
  if (cur >= max) return null;
  memorySet(key, String(cur + 1), ttlSeconds);
  memorySet(holderKey, "1", ttlSeconds);
  return async () => {
    const n = Number(memoryGet(key) ?? "0");
    memorySet(key, String(Math.max(0, n - 1)), ttlSeconds);
    memoryStore.delete(holderKey);
  };
}
