import "./types/express.js";
import { config } from "./config.js";
import { initRedis } from "./services/redis.js";
import { startJobWorkers } from "./services/jobs/queue.js";
import { logger } from "./services/logger.js";

await initRedis();
startJobWorkers();
logger.info("worker_process_started", {
  redis: Boolean(config.redisUrl),
  poolSize: config.databasePoolSize
});

// Keep process alive; BullMQ workers run on event loop.
setInterval(() => {
  /* heartbeat */
}, 60_000);
