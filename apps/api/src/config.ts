import path from "node:path";
import { config as loadEnv } from "dotenv";

// Support running from monorepo root or from apps/api.
loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), override: false });

const DEFAULT_LOCAL_OPENAI_BASE = "http://localhost:11434/v1";

const openaiApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
const rawOpenaiBaseUrl = process.env.OPENAI_BASE_URL;

/** When unset: use hosted OpenAI if an API key is set; otherwise default to local Ollama compatibility. Set to empty string to force no custom base (template-only when no key). */
let openaiBaseUrl: string | undefined;
if (rawOpenaiBaseUrl !== undefined) {
  const t = rawOpenaiBaseUrl.trim();
  openaiBaseUrl = t === "" ? undefined : t;
} else if (openaiApiKey) {
  openaiBaseUrl = undefined;
} else {
  openaiBaseUrl = DEFAULT_LOCAL_OPENAI_BASE;
}

const openaiModel =
  process.env.OPENAI_MODEL?.trim() ||
  (openaiBaseUrl ? "llama3.2" : "gpt-4o-mini");

const iamAuthRaw = process.env.DATABASE_IAM_AUTH?.trim().toLowerCase();
const databaseIamAuth = iamAuthRaw === "true" || iamAuthRaw === "1" || iamAuthRaw === "yes";

function parseBoolEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return defaultValue;
}

const DEV_JWT_SECRET = "dev-insecure-change-me";
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;

if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || jwtSecret === DEV_JWT_SECRET) {
    throw new Error("JWT_SECRET must be set to a strong value in production");
  }
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  /** When true, the DB password in DATABASE_URL is replaced with an RDS IAM auth token (rotated periodically). */
  databaseIamAuth,
  /** Region passed to the RDS signer (defaults to DATABASE_IAM_REGION, then AWS_REGION). */
  databaseIamRegion:
    process.env.DATABASE_IAM_REGION?.trim() || process.env.AWS_REGION?.trim() || "",
  /** How often to rotate the IAM token and recreate PrismaClient (default 10 minutes; tokens last ~15 minutes). */
  databaseIamTokenRefreshMs: Math.max(
    60_000,
    Number(process.env.DATABASE_IAM_TOKEN_REFRESH_MS) || 10 * 60 * 1000
  ),
  /**
   * Absolute path to the Vite `dist` folder (e.g. `/app/apps/web/dist`).
   * When set, the API also serves the SPA so one origin can host UI + `/api` (e.g. AWS App Runner).
   */
  webDist: process.env.WEB_DIST?.trim() || "",
  /** Public privacy policy URL shown in trust/compliance responses (optional). */
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL?.trim() || "",
  /** Version label recorded on consent records (e.g. v1). */
  privacyPolicyVersion: process.env.PRIVACY_POLICY_VERSION?.trim() || "v1",
  /**
   * When true, account deletion may be blocked when tax reports exist (legal retention).
   * Defaults to false until legal role is confirmed.
   */
  legalRetentionMode: parseBoolEnv(process.env.LEGAL_RETENTION_MODE, false),
  /** OpenAI API key for hosted OpenAI, or when your local server expects Authorization. */
  openaiApiKey,
  /** OpenAI-compatible API base (Ollama, LM Studio, vLLM). Omitted env defaults to local Ollama when no API key is set. */
  openaiBaseUrl: openaiBaseUrl ?? "",
  openaiModel,
  /** True when LLM calls should run (hosted key and/or non-empty base URL, including default local). */
  get llmEnabled(): boolean {
    return Boolean(config.openaiApiKey || config.openaiBaseUrl);
  },
  /** If set, `GET /api/admin/rule-overrides` requires header `x-admin-token` with this value. */
  adminToken: process.env.ADMIN_TOKEN?.trim() || "",
  /**
   * When false, `POST /api/auth/register` is rejected. Defaults to open in non-production, closed in production.
   */
  registrationEnabled: parseBoolEnv(process.env.REGISTRATION_ENABLED, true),
  /**
   * Local fallback for document uploads when S3 is not configured.
   * Not horizontal-safe — use S3_* for multi-replica.
   */
  uploadsDir: process.env.UPLOADS_DIR?.trim() || path.resolve(process.cwd(), "uploads"),
  /** Redis URL for admission control, rate limits, and BullMQ. Required for multi-replica. */
  redisUrl: process.env.REDIS_URL?.trim() || "",
  /** Max in-flight LLM completions across the cluster. */
  llmMaxInFlight: Math.max(1, Number(process.env.LLM_MAX_IN_FLIGHT) || 40),
  /** Soft TTL for semaphore keys (seconds). */
  llmSemaphoreTtlSeconds: Math.max(30, Number(process.env.LLM_SEMAPHORE_TTL_SECONDS) || 120),
  /** Per-completion timeout (ms). */
  llmTimeoutMs: Math.max(5_000, Number(process.env.LLM_TIMEOUT_MS) || 60_000),
  /** Max completion tokens for tool turns. */
  llmMaxTokens: Math.max(256, Number(process.env.LLM_MAX_TOKENS) || 2048),
  /** Max tool recovery rounds per turn. */
  llmMaxToolRounds: Math.max(1, Number(process.env.LLM_MAX_TOOL_ROUNDS) || 2),
  /** Chat messages per user per window. */
  rateLimitChatMax: Math.max(1, Number(process.env.RATE_LIMIT_CHAT_MAX) || 60),
  rateLimitChatWindowSeconds: Math.max(1, Number(process.env.RATE_LIMIT_CHAT_WINDOW_SECONDS) || 60),
  /** Auth login/register per IP per window. */
  rateLimitAuthMax: Math.max(1, Number(process.env.RATE_LIMIT_AUTH_MAX) || 30),
  rateLimitAuthWindowSeconds: Math.max(1, Number(process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS) || 60),
  /** Prisma/pg connection limit per process (append to DATABASE_URL if unset). */
  databasePoolSize: Math.max(1, Number(process.env.DATABASE_POOL_SIZE) || 10),
  /** S3-compatible object storage (optional; falls back to local uploadsDir). */
  s3Bucket: process.env.S3_BUCKET?.trim() || "",
  s3Region: process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1",
  s3Endpoint: process.env.S3_ENDPOINT?.trim() || "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() || "",
  s3ForcePathStyle: parseBoolEnv(process.env.S3_FORCE_PATH_STYLE, false),
  /** When true, API/worker process runs BullMQ workers in-process (dev). Prefer separate worker process in prod. */
  runWorkersInProcess: parseBoolEnv(process.env.RUN_WORKERS_IN_PROCESS, process.env.NODE_ENV !== "production"),
  get objectStorageEnabled(): boolean {
    return Boolean(config.s3Bucket);
  }
};
