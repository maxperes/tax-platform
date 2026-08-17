import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, signOut, type SessionListItem, type UserProfile } from "../api";
import { LoadingShell } from "../components/LoadingShell";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SecondaryButton } from "../components/ui/SecondaryButton";
import { StatusBadge } from "../components/ui/StatusBadge";
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

type TwinListItem = {
  id: string;
  taxYear: number;
  asIsCompletion: number;
  updatedAt: string;
};

export function SessionsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: sessions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<SessionListItem[]>("/api/sessions")
  });

  const { data: twins = [] } = useQuery({
    queryKey: ["twins"],
    queryFn: () => api<TwinListItem[]>("/api/twins")
  });

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api<UserProfile>("/api/me/profile")
  });

  const inProgress = sessions.filter((s) => s.state !== "complete" && s.taxYear === currentYear);
  const latestInProgress = inProgress[0];
  const currentTwin = twins.find((twin) => twin.taxYear === currentYear);

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

  async function deleteSession(session: SessionListItem) {
    const label = `${session.taxYear} · ${formatStep(session.state)}`;
    if (
      !window.confirm(
        `Delete this chat (${label})?\n\nThis removes the conversation only. Tax data for the year is kept.`
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(session.id);
    try {
      await api(`/api/sessions/${session.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete session");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) return <LoadingShell message="Loading your home…" />;

  return (
    <div className="flex min-h-screen flex-col">
      <Header signedIn />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-content px-5 py-12 lg:px-8">
          <p className="eyebrow">Home</p>
          <h1 className="mt-2 font-display text-3xl text-navy sm:text-4xl">
            Map your Brazilian tax position
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-700/80">
            Build your 360° Brazilian tax map through a structured interview or a conversational
            copilot — both land on the same cross-border view for {currentYear}.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
              <p className="eyebrow">Structured interview</p>
              <h2 className="mt-2 font-display text-xl text-navy">Tax residency impact assessment</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-700/75">
                Step-by-step questions, documents checklist, 360° map and a preliminary engine report.
              </p>
              {currentTwin && (
                <p className="mt-3 text-sm text-navy-700">
                  As Is completion {currentTwin.asIsCompletion}% · updated{" "}
                  {new Date(currentTwin.updatedAt).toLocaleDateString()}
                </p>
              )}
              <div className="mt-6">
                <PrimaryButton href={currentTwin ? `/impact/${currentTwin.id}` : "/start"} fullWidth>
                  {currentTwin ? "Continue assessment" : "Start assessment"}
                </PrimaryButton>
              </div>
            </section>

            <section className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
              <p className="eyebrow">AI copilot</p>
              <h2 className="mt-2 font-display text-xl text-navy">Conversational intake</h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-700/75">
                Chat through residency and income — then open the same 360° tax map. Optional filing
                detail stays available afterward.
              </p>
              {latestInProgress && (
                <p className="mt-3 text-sm text-navy-700">
                  {latestInProgress.taxYear} · {formatStep(latestInProgress.state)}
                </p>
              )}
              <div className="mt-6 flex flex-col gap-3">
                {latestInProgress ? (
                  <PrimaryButton href={`/chat/${latestInProgress.id}`} fullWidth>
                    Continue copilot
                  </PrimaryButton>
                ) : (
                  <PrimaryButton onClick={() => void startNewSession()} disabled={creating} fullWidth>
                    {creating ? "Creating…" : `Start ${currentYear} with copilot`}
                  </PrimaryButton>
                )}
                <SecondaryButton onClick={() => void startNewSession()} disabled={creating} fullWidth>
                  New session
                </SecondaryButton>
              </div>
            </section>
          </div>

          {isError && (
            <div className="mt-6 rounded-lg border border-alertRed/30 bg-alertRed-light px-4 py-3 text-sm text-alertRed">
              <p>Could not load sessions.</p>
              <button type="button" onClick={() => void refetch()} className="mt-2 font-medium underline">
                Retry
              </button>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-alertRed">{error}</p>}

          {sessions.length > 0 && (
            <section className="mt-10">
              <h2 className="font-display text-xl text-navy">Recent filing sessions</h2>
              <ul className="mt-4 space-y-2">
                {sessions.slice(0, 10).map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-4 py-3"
                  >
                    <Link
                      to={`/chat/${session.id}`}
                      className="flex min-w-0 flex-1 items-center justify-between hover:text-accent-dark"
                    >
                      <span className="text-sm font-medium text-navy">
                        {session.taxYear} · {formatStep(session.state)}
                      </span>
                      <span className="flex items-center gap-3">
                        {session.requiresAdditionalReview && (
                          <StatusBadge tone="warning">Review</StatusBadge>
                        )}
                        <span className="text-xs text-navy-700/60">
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void deleteSession(session)}
                      disabled={deletingId === session.id}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-alertRed hover:bg-alertRed-light disabled:opacity-50"
                    >
                      {deletingId === session.id ? "Deleting…" : "Delete"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 flex flex-wrap gap-4 text-sm">
            {profile?.isAdmin && (
              <Link to="/admin/users" className="font-medium text-accent-dark hover:underline">
                User approvals
              </Link>
            )}
            <Link to="/privacy" className="font-medium text-accent-dark hover:underline">
              Privacy
            </Link>
            <button
              type="button"
              onClick={() => {
                signOut();
                nav("/login", { replace: true });
              }}
              className="font-medium text-navy-700 hover:text-navy"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
