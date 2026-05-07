const TOKEN_KEY = "tax_platform_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}
