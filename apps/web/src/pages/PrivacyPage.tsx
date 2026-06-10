import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthConfig } from "../auth-config";
import { api, downloadAuthenticated, getToken, setToken } from "../api";

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
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl space-y-8">
        <div>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="text-sm text-emerald-400 hover:underline"
          >
            Back
          </button>
          <h1 className="text-2xl font-semibold mt-3 mb-1">Privacy &amp; data</h1>
          <p className="text-slate-400 text-sm">
            Manage your personal data under LGPD (export, erasure). Policy version:{" "}
            <span className="text-slate-300">{privacyPolicyVersion}</span>.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading account…</p>
        ) : profile ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm">
            <p className="text-slate-400">Signed in as</p>
            <p className="font-medium text-slate-100">{profile.email}</p>
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Your rights</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Download a machine-readable copy of the data we store for your account, including fiscal
            profile, chat history, incomes, deductions, and tax reports.
          </p>
          {privacyPolicyUrl ? (
            <p className="text-sm">
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                Read our privacy policy
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Privacy policy URL is not configured.</p>
          )}
          {exportError && <p className="text-sm text-red-400">{exportError}</p>}
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {exporting ? "Preparing export…" : "Export my data"}
          </button>
        </section>

        <section className="space-y-3 border-t border-slate-800 pt-6">
          <h2 className="text-lg font-medium text-red-300">Delete account</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Permanently erase your account and all associated tax data. This cannot be undone.
          </p>
          <form onSubmit={onDeleteAccount} className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Type <strong className="text-slate-200">DELETE</strong> to confirm
              </label>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
            <button
              type="submit"
              disabled={deleting || confirmText !== "DELETE"}
              className="rounded-lg border border-red-800 bg-red-950/50 hover:bg-red-900/50 px-4 py-2 text-sm font-medium text-red-200 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
