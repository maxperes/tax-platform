export function LoadingShell({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-500"
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm">{message}</p>
    </div>
  );
}
