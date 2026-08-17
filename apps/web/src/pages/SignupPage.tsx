import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthConfig } from "../auth-config";
import { api } from "../api";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { PrimaryButton } from "../components/ui/PrimaryButton";

export function SignupPage() {
  const { registrationEnabled, privacyPolicyUrl } = useAuthConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedSensitiveDataProcessing, setAcceptedSensitiveDataProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!registrationEnabled) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api<{ message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, acceptedTerms, acceptedSensitiveDataProcessing })
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white p-8 shadow-card">
          {submitted ? (
            <div className="text-center space-y-4">
              <h1 className="font-display text-2xl text-navy">Request submitted</h1>
              <p className="text-sm text-navy-700/75">
                An administrator will review your request before you can sign in.
              </p>
              <PrimaryButton href="/login">Back to sign in</PrimaryButton>
            </div>
          ) : (
            <>
              <p className="eyebrow">Access</p>
              <h1 className="mt-2 font-display text-2xl text-navy">Create account</h1>
              <p className="mt-2 text-sm text-navy-700/75">
                Submit your details for review. You will be able to sign in after approval.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-navy mb-1">Email</label>
                  <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy mb-1">Password (min 8)</label>
                  <input
                    className="field-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <label className="flex items-start gap-2 text-sm text-navy-700">
                  <input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required />
                  <span>
                    I accept the terms of service
                    {privacyPolicyUrl ? (
                      <>
                        {" "}
                        and{" "}
                        <a href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-dark hover:underline">
                          privacy policy
                        </a>
                      </>
                    ) : (
                      " and privacy policy"
                    )}
                    .
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-navy-700">
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
                {error && <p className="text-sm text-alertRed">{error}</p>}
                <PrimaryButton
                  type="submit"
                  disabled={loading || !acceptedTerms || !acceptedSensitiveDataProcessing}
                  fullWidth
                >
                  {loading ? "Submitting…" : "Request access"}
                </PrimaryButton>
              </form>
              <p className="mt-4 text-center text-sm text-navy-700/70">
                Already have an account?{" "}
                <Link className="font-medium text-accent-dark hover:underline" to="/login">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
