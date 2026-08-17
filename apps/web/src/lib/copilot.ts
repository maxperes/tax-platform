import { api, type SessionListItem } from "../api";

export async function openOrCreateCopilotSession(taxYear = new Date().getFullYear()): Promise<string> {
  const sessions = await api<SessionListItem[]>("/api/sessions");
  const existing = sessions.find((session) => session.taxYear === taxYear);
  if (existing) return existing.id;
  const created = await api<{ id: string }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ taxYear })
  });
  return created.id;
}
