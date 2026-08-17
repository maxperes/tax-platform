export function LoadingShell({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-navy-700">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-navy-100 border-t-accent"
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm">{message}</p>
    </div>
  );
}
