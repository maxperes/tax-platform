import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthConfig } from "../auth-config";
import { api, setToken, type LoginResponse } from "../api";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { PrimaryButton } from "../components/ui/PrimaryButton";

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
      const res = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(res.token);
      nav(res.user.isAdmin ? "/admin/users" : "/sessions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white p-8 shadow-card">
          <p className="eyebrow">Sign in</p>
          <h1 className="mt-2 font-display text-2xl text-navy">Welcome back</h1>
          <p className="mt-2 text-sm text-navy-700/75">Continue your Brazilian tax map or filing intake.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Email</label>
              <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Password</label>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-alertRed">{error}</p>}
            <PrimaryButton type="submit" disabled={loading} fullWidth>
              {loading ? "Signing in…" : "Sign in"}
            </PrimaryButton>
          </form>
          {!registrationEnabled && (
            <p className="mt-4 text-center text-sm text-navy-700/70">Access is by invitation.</p>
          )}
          {registrationEnabled && (
            <p className="mt-4 text-center text-sm text-navy-700/70">
              No account?{" "}
              <Link className="font-medium text-accent-dark hover:underline" to="/signup">
                Request access
              </Link>
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
