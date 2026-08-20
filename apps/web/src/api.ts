const TOKEN_KEY = "tax_platform_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function signOut(): void {
  setToken(null);
}

export type UserProfile = {
  id: string;
  email: string;
  isAdmin: boolean;
  status: "pending" | "approved" | "rejected";
  plan?: "basic" | "pro";
  createdAt: string;
};

export type LoginResponse = {
  token: string;
  user: Pick<UserProfile, "id" | "email" | "status" | "isAdmin">;
};

export type AdminUserListItem = Pick<UserProfile, "id" | "email" | "status" | "isAdmin" | "createdAt">;

export type SessionListItem = {
  id: string;
  taxYear: number;
  state: string;
  requiresAdditionalReview: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Progressive SSE of the assistant reply (real token stream when LLM path runs). */
export async function streamSessionMessage(
  sessionId: string,
  content: string,
  onDelta: (delta: string) => void
): Promise<{ sessionState: string }> {
  const res = await fetch(`/api/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders()
    },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiErrorBody(err, res.statusText));
  }
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let sessionState = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6)) as {
        delta?: string;
        done?: boolean;
        sessionState?: string;
        error?: string;
        status?: number;
      };
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (payload.delta) onDelta(payload.delta);
      if (payload.done && payload.sessionState) sessionState = payload.sessionState;
    }
  }
  return { sessionState };
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

type ZodFlattenedError = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

function formatZodFlattenedError(payload: ZodFlattenedError): string | null {
  const formErrors = payload.formErrors ?? [];
  const fieldMsgs = Object.entries(payload.fieldErrors ?? {}).flatMap(([field, msgs]) =>
    (msgs ?? []).map((msg) => (field ? `${field}: ${msg}` : msg))
  );
  const messages = [...formErrors, ...fieldMsgs].filter(Boolean);
  return messages.length > 0 ? messages.join("; ") : null;
}

/** Turn `{ error: string | ZodFlatten }` (and optional `details`) into a readable message. */
export function formatApiErrorBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const { error, details } = body as {
    error?: string | ZodFlattenedError;
    details?: ZodFlattenedError;
  };

  if (typeof error === "string") {
    if (details && typeof details === "object") {
      const fromDetails = formatZodFlattenedError(details);
      if (fromDetails) return fromDetails;
    }
    return error;
  }

  if (error && typeof error === "object") {
    const fromError = formatZodFlattenedError(error);
    if (fromError) return fromError;
  }

  return fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
    ...authHeaders()
  };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      signOut();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiErrorBody(err, res.statusText));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiErrorBody(err, res.statusText));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
