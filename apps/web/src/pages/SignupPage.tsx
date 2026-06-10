import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthConfig } from "../auth-config";
import { api } from "../api";

export function SignupPage() {
  const { registrationEnabled, privacyPolicyUrl } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedSensitiveDataProcessing, setAcceptedSensitiveDataProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!registrationEnabled) {
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          acceptedTerms,
          acceptedSensitiveDataProcessing
        })
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl text-center space-y-4">
          <h1 className="text-2xl font-semibold">Request submitted</h1>
          <p className="text-slate-400 text-sm">
            Your account has been created. An administrator will review your request before you can
            sign in.
          </p>
          <Link
            to="/login"
            className="inline-block rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold mb-1">Create account</h1>
        <p className="text-slate-400 text-sm mb-6">
          Submit your details for review. You will be able to sign in after an administrator
          approves your account.
        </p>
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
            <label className="block text-sm text-slate-400 mb-1">Password (min 8)</label>
            <input
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span>
              I accept the terms of service
              {privacyPolicyUrl ? (
                <>
                  {" "}
                  and{" "}
                  <a
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    privacy policy
                  </a>
                </>
              ) : (
                " and privacy policy"
              )}
              .
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              className="mt-1"
              checked={acceptedSensitiveDataProcessing}
              onChange={(e) => setAcceptedSensitiveDataProcessing(e.target.checked)}
              required
            />
            <span>
              I consent to processing of sensitive personal data (tax, financial, and identity
              information) required for this service, including LLM-assisted intake when enabled.
            </span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={
              loading || !acceptedTerms || !acceptedSensitiveDataProcessing
            }
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Request access"}
          </button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account?{" "}
          <Link className="text-emerald-400 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
