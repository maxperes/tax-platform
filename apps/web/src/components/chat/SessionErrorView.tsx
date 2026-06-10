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
        <div className="max-w-md rounded-xl border border-rose-800/50 bg-rose-950/30 p-6 text-center space-y-4">
          <h1 className="text-lg font-semibold text-rose-100">Could not load session</h1>
          <p className="text-sm text-rose-200/80">{errorMessage ?? "Session not found or network error."}</p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
            >
              Retry
            </button>
            <Link to="/sessions" className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 hover:border-emerald-600">
              All sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
