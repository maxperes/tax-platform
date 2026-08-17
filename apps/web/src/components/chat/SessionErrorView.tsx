import { Link } from "react-router-dom";
import { LoadingShell } from "../LoadingShell";

type Props = {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
};

export function SessionErrorView({ isLoading, isError, errorMessage, onRetry }: Props) {
  if (isLoading) {
    return <LoadingShell message="Loading session…" />;
  }
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-alertRed/30 bg-alertRed-light p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-alertRed">Could not load session</h1>
          <p className="text-sm text-alertRed/80">{errorMessage ?? "Session not found or network error."}</p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-accent hover:bg-accent-dark px-4 py-2 font-medium text-white"
            >
              Retry
            </button>
            <Link to="/sessions" className="rounded-lg border border-surface-border px-4 py-2 text-navy hover:border-accent">
              All sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
