import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, signOut, type SessionListItem, type UserProfile } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { stepLabelForState } from "../lib/chat-constants";

const STEP_LABELS: Record<string, string> = {
  fiscal_residence: "Fiscal profile",
  income_capture: "Income",
  events: "Derived events",
  capital_gain: "Capital gains",
  deductions: "Deductions",
  monthly_calc: "Monthly tax",
  report: "Report",
  complete: "Done"
};

function formatStep(state: string): string {
  return STEP_LABELS[state] ?? stepLabelForState(state);
}

export function SessionsPage() {
  const nav = useNavigate();
  const currentYear = new Date().getFullYear();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<SessionListItem[]>("/api/sessions")
  });

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api<UserProfile>("/api/me/profile")
  });

  const inProgress = sessions.filter((s) => s.state !== "complete" && s.taxYear === currentYear);
  const latestInProgress = inProgress[0];

  async function startNewSession() {
    setError(null);
    setCreating(true);
    try {
      const session = await api<{ id: string }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ taxYear: currentYear })
      });
      nav(`/chat/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create session");
    } finally {
      setCreating(false);
    }
  }

  function handleSignOut() {
    signOut();
    nav("/login", { replace: true });
  }

  if (isLoading) {
    return <LoadingShell message="Loading your sessions…" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Tax intake</h1>
          <p className="text-slate-400 text-sm">
            Continue an in-progress session or start a new one for {currentYear}.
          </p>
        </div>

        {isError && (
          <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            <p>Could not load sessions.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-emerald-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {latestInProgress && (
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/25 px-4 py-4 space-y-3">
            <p className="text-sm text-emerald-100 font-medium">Continue where you left off</p>
            <p className="text-xs text-slate-400">
              {latestInProgress.taxYear} · {formatStep(latestInProgress.state)} · updated{" "}
              {new Date(latestInProgress.updatedAt).toLocaleDateString()}
            </p>
            <button
              type="button"
              onClick={() => nav(`/chat/${latestInProgress.id}`)}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 text-sm font-medium"
            >
              Continue session
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => void startNewSession()}
          disabled={creating}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 text-sm font-medium text-slate-200 hover:border-emerald-600 disabled:opacity-50"
        >
          {creating ? "Creating…" : `Start new ${currentYear} session`}
        </button>

        {sessions.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Recent sessions</h2>
            <ul className="max-h-48 overflow-y-auto space-y-1 text-sm">
              {sessions.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/chat/${s.id}`}
                    className="flex justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-emerald-700"
                  >
                    <span>
                      {s.taxYear} · {formatStep(s.state)}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-800 text-sm">
          {profile?.isAdmin && (
            <Link to="/admin/users" className="text-emerald-400 hover:underline">
              User approvals
            </Link>
          )}
          <Link to="/privacy" className="text-emerald-400 hover:underline">
            Privacy
          </Link>
          <button type="button" onClick={handleSignOut} className="text-slate-400 hover:text-slate-200">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
