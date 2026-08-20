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
        <div className="max-w-md space-y-4 rounded-md border border-alertRed/30 bg-alertRed-light p-6 text-center">
          <h1 className="text-lg font-semibold text-alertRed">Could not load session</h1>
          <p className="text-sm text-alertRed/80">{errorMessage ?? "Session not found or network error."}</p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-dark"
            >
              Retry
            </button>
            <a href="/sessions" className="rounded-md border border-surface-border px-4 py-2 text-navy hover:border-accent">
              All sessions
            </a>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
