import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../auth-config";
import { api, setToken } from "../api";

export function LoginPage() {
  const nav = useNavigate();
  const { registrationEnabled } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(res.token);
      nav("/sessions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-1">Welcome back</h1>
        <p className="text-slate-400 text-sm mb-6">Sign in to continue your tax interview.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Password</label>
            <input
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        {!registrationEnabled && (
          <p className="text-center text-sm text-slate-500 mt-4">
            Access is by invitation. Contact us if you need an account.
          </p>
        )}
        {registrationEnabled && (
          <p className="text-center text-sm text-slate-500 mt-4">
            No account?{" "}
            <Link className="text-emerald-400 hover:underline" to="/signup">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
