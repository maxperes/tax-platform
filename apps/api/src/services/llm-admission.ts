import { config } from "../config.js";
import { acquireSemaphore } from "./redis.js";
import { incrMetric, setGauge } from "./metrics.js";
import { logger } from "./logger.js";

const SEMAPHORE_KEY = "llm:inflight";
let localInFlight = 0;

export class LlmAdmissionError extends Error {
  status = 429;
  retryAfterSeconds: number;

  constructor(message = "LLM capacity exhausted", retryAfterSeconds = 5) {
    super(message);
    this.name = "LlmAdmissionError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Acquire a cluster-wide LLM slot. Caller must always invoke the returned release.
 * Throws LlmAdmissionError when saturated.
 */
export async function withLlmAdmission<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireSemaphore(
    SEMAPHORE_KEY,
    config.llmMaxInFlight,
    config.llmSemaphoreTtlSeconds
  );
  if (!release) {
    incrMetric("llm_admission_rejected");
    logger.warn("llm_admission_rejected", { maxInFlight: config.llmMaxInFlight });
    throw new LlmAdmissionError();
  }
  localInFlight += 1;
  setGauge("llm_inflight_local", localInFlight);
  incrMetric("llm_admission_acquired");
  const started = Date.now();
  try {
    return await fn();
  } finally {
    localInFlight = Math.max(0, localInFlight - 1);
    setGauge("llm_inflight_local", localInFlight);
    incrMetric("llm_admission_released");
    setGauge("llm_last_call_ms", Date.now() - started);
    await release();
  }
}

export async function withLlmTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          incrMetric("llm_timeout");
          reject(new Error(`LLM timeout after ${config.llmTimeoutMs}ms (${label})`));
        }, config.llmTimeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
