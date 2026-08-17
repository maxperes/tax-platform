import { Queue, Worker, QueueEvents, Job, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../../config.js";
import { logger } from "../logger.js";
import { incrMetric, setGauge } from "../metrics.js";
import { getRedis, isRedisConfigured } from "../redis.js";

export const JOB_NAMES = {
  buildReport: "build-report",
  recomputeSessions: "recompute-sessions",
  extractDocument: "extract-document"
} as const;

export type BuildReportJobData = { userId: string; taxYear: number };
export type RecomputeSessionsJobData = { taxYear: number };
export type ExtractDocumentJobData = { documentId: string; userId: string };

export type AppJobData =
  | BuildReportJobData
  | RecomputeSessionsJobData
  | ExtractDocumentJobData;

const QUEUE_NAME = "tax-platform";

let queue: Queue | null = null;
const memoryJobs = new Map<
  string,
  { status: string; result?: unknown; failedReason?: string; name: string; data: unknown }
>();
let memorySeq = 0;

function bullConnection(): Redis {
  const existing = getRedis();
  if (existing) {
    return existing.duplicate({ maxRetriesPerRequest: null });
  }
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}

export function getJobQueue(): Queue | null {
  if (!isRedisConfigured()) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: bullConnection() });
  }
  return queue;
}

const defaultJobOpts: JobsOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 500 },
  attempts: 2,
  backoff: { type: "exponential", delay: 2000 }
};

export async function enqueueJob(
  name: string,
  data: AppJobData,
  opts?: JobsOptions
): Promise<{ jobId: string; mode: "queue" | "inline" }> {
  const q = getJobQueue();
  if (!q) {
    logger.warn("job_queue_unavailable_running_inline", { name });
    const id = `inline-${++memorySeq}`;
    memoryJobs.set(id, { status: "active", name, data });
    void (async () => {
      try {
        const result = await processJobPayload(name, data);
        memoryJobs.set(id, { status: "completed", name, data, result });
        incrMetric("jobs_completed");
      } catch (err) {
        memoryJobs.set(id, {
          status: "failed",
          name,
          data,
          failedReason: err instanceof Error ? err.message : String(err)
        });
        incrMetric("jobs_failed");
      }
    })();
    return { jobId: id, mode: "inline" };
  }
  const job = await q.add(name, data, { ...defaultJobOpts, ...opts });
  incrMetric("jobs_enqueued");
  return { jobId: String(job.id), mode: "queue" };
}

export async function getJobStatus(jobId: string): Promise<{
  id: string;
  name?: string;
  status: string;
  result?: unknown;
  failedReason?: string;
} | null> {
  if (jobId.startsWith("inline-")) {
    const row = memoryJobs.get(jobId);
    if (!row) return null;
    return {
      id: jobId,
      name: row.name,
      status: row.status,
      result: row.result,
      failedReason: row.failedReason
    };
  }
  const q = getJobQueue();
  if (!q) return null;
  const job = await Job.fromId(q, jobId);
  if (!job) return null;
  const state = await job.getState();
  return {
    id: jobId,
    name: job.name,
    status: state,
    result: job.returnvalue,
    failedReason: job.failedReason
  };
}

async function processJobPayload(name: string, data: AppJobData): Promise<unknown> {
  if (name === JOB_NAMES.buildReport) {
    const { buildAndSaveReport } = await import("../tax-pipeline.js");
    const d = data as BuildReportJobData;
    const id = await buildAndSaveReport(d.userId, d.taxYear);
    return { reportId: id };
  }
  if (name === JOB_NAMES.recomputeSessions) {
    const { syncTaxableEvents, recomputeMonthlyTax, estimateAnnualTax } = await import(
      "../tax-pipeline.js"
    );
    const { prisma } = await import("../../db.js");
    const { loadRulePatches } = await import("../rule-overrides.js");
    const d = data as RecomputeSessionsJobData;
    const sessions = await prisma.conversationSession.findMany({
      where: { taxYear: d.taxYear },
      select: { userId: true },
      distinct: ["userId"]
    });
    let recomputed = 0;
    for (const { userId } of sessions) {
      await syncTaxableEvents(userId, d.taxYear);
      await recomputeMonthlyTax(userId, d.taxYear);
      await estimateAnnualTax(userId, d.taxYear);
      recomputed += 1;
    }
    const brPatches = await loadRulePatches("BR", d.taxYear);
    const usPatches = await loadRulePatches("US", d.taxYear);
    return {
      taxYear: d.taxYear,
      usersRecomputed: recomputed,
      overrideCounts: { BR: brPatches.length, US: usPatches.length }
    };
  }
  if (name === JOB_NAMES.extractDocument) {
    const { runDocumentExtraction } = await import("../documents.js");
    const d = data as ExtractDocumentJobData;
    return runDocumentExtraction(d.userId, d.documentId);
  }
  throw new Error(`Unknown job: ${name}`);
}

let workerStarted = false;

export function startJobWorkers(): void {
  if (workerStarted) return;
  if (!isRedisConfigured()) {
    logger.warn("job_workers_skipped_no_redis");
    return;
  }
  workerStarted = true;
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      setGauge("jobs_worker_active", 1);
      logger.info("job_start", { id: job.id, name: job.name });
      try {
        const result = await processJobPayload(job.name, job.data as AppJobData);
        incrMetric("jobs_completed");
        return result;
      } catch (err) {
        incrMetric("jobs_failed");
        throw err;
      } finally {
        setGauge("jobs_worker_active", 0);
      }
    },
    { connection: bullConnection(), concurrency: 2 }
  );
  worker.on("failed", (job, err) => {
    logger.error("job_failed", { id: job?.id, name: job?.name, error: String(err) });
  });
  worker.on("completed", (job) => {
    logger.info("job_completed", { id: job.id, name: job.name });
  });
  logger.info("job_workers_started");
}

/** Used by tests / rare sync paths that must wait. */
export async function enqueueAndWait(
  name: string,
  data: AppJobData
): Promise<unknown> {
  if (!isRedisConfigured()) {
    const { jobId } = await enqueueJob(name, data);
    for (let i = 0; i < 600; i++) {
      const st = await getJobStatus(jobId);
      if (st?.status === "completed") return st.result;
      if (st?.status === "failed") throw new Error(st.failedReason || "Job failed");
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Inline job timeout");
  }
  const { jobId } = await enqueueJob(name, data);
  const q = getJobQueue()!;
  const job = await Job.fromId(q, jobId);
  if (!job) throw new Error("Job missing after enqueue");
  const events = new QueueEvents(QUEUE_NAME, { connection: bullConnection() });
  try {
    return await job.waitUntilFinished(events);
  } finally {
    await events.close();
  }
}
