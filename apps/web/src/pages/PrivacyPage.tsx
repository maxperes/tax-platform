import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthConfig } from "../auth-config";
import { api, downloadAuthenticated, getToken, setToken, signOut } from "../api";

type Profile = {
  id: string;
  email: string;
  createdAt: string;
};

export function PrivacyPage() {
  const nav = useNavigate();
  const { privacyPolicyUrl, privacyPolicyVersion } = useAuthConfig();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["me-profile"],
    queryFn: () => api<Profile>("/api/me/profile")
  });

  async function onExport() {
    setExportError(null);
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadAuthenticated(
        "/api/me/data-export",
        `tax-platform-data-export-${date}.json`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function onDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch("/api/me/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken() || ""}`
        },
        body: JSON.stringify({ password, confirm: confirmText })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || res.statusText);
      }
      setToken(null);
      nav("/login", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-lg flex-1 px-5 py-10">
        <div className="rounded-2xl border border-surface-border bg-white p-8 shadow-card space-y-8">
        <div>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="text-sm text-accent-dark hover:underline"
          >
            Back
          </button>
          <h1 className="text-2xl font-display text-navy mt-3 mb-1">Privacy &amp; data</h1>
          <p className="text-navy-700/75 text-sm">
            Manage your personal data under LGPD (export, erasure). Policy version:{" "}
            <span className="text-navy">{privacyPolicyVersion}</span>.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-navy-700/75">Loading account…</p>
        ) : profile ? (
          <div className="rounded-lg border border-surface-border bg-surface-muted px-4 py-3 text-sm">
            <p className="text-navy-700/70">Signed in as</p>
            <p className="font-medium text-navy">{profile.email}</p>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your rights</h2>
          <p className="text-sm text-navy-700/75 leading-relaxed">
            Download a machine-readable copy of the data we store for your account, including fiscal
            profile, chat history, incomes, deductions, and tax reports.
          </p>
          {privacyPolicyUrl ? (
            <p className="text-sm">
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-dark hover:underline"
              >
                Read our privacy policy
              </a>
            </p>
          ) : (
            <p className="text-sm text-navy-700/60">Privacy policy URL is not configured.</p>
          )}
          {exportError && <p className="text-sm text-alertRed">{exportError}</p>}
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting}
            className="rounded-full bg-accent hover:bg-accent-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {exporting ? "Preparing export…" : "Export my data"}
          </button>
        </section>

        <section className="space-y-3 border-t border-surface-border pt-6">
          <h2 className="text-lg font-medium">Sign out</h2>
          <p className="text-sm text-navy-700/75">End your session on this device without deleting data.</p>
          <button
            type="button"
            onClick={() => {
              signOut();
              nav("/login", { replace: true });
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm hover:border-accent"
          >
            Sign out
          </button>
        </section>

        <section className="space-y-3 border-t border-surface-border pt-6">
          <h2 className="text-lg font-medium text-alertRed">Delete account</h2>
          <p className="text-sm text-navy-700/75 leading-relaxed">
            Permanently erase your account and all associated tax data. This cannot be undone.
          </p>
          <form onSubmit={onDeleteAccount} className="space-y-3">
            <div>
              <label className="block text-sm text-navy-700/75 mb-1">Password</label>
              <input
                className="w-full rounded-lg bg-white border border-surface-border px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-navy-700/75 mb-1">
                Type <strong className="text-navy">DELETE</strong> to confirm
              </label>
              <input
                className="w-full rounded-lg bg-white border border-surface-border px-3 py-2 text-sm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            {deleteError && <p className="text-sm text-alertRed">{deleteError}</p>}
            <button
              type="submit"
              disabled={deleting || confirmText !== "DELETE"}
              className="rounded-lg border border-alertRed/40 bg-alertRed-light hover:bg-alertRed-light px-4 py-2 text-sm font-medium text-alertRed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </form>
        </section>
      </div>
      </div>
    </div>
  );
}
