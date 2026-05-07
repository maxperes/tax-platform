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

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-change-me",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL || "",
  /**
   * Absolute path to the Vite `dist` folder (e.g. `/app/apps/web/dist`).
   * When set, the API also serves the SPA so one origin can host UI + `/api` (e.g. AWS App Runner).
   */
  webDist: process.env.WEB_DIST?.trim() || "",
  /** Public privacy policy URL shown in trust/compliance responses (optional). */
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL?.trim() || "",
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
  adminToken: process.env.ADMIN_TOKEN?.trim() || ""
};
