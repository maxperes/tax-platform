type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ActionBanner({ message, onDismiss }: Props) {
  return (
    <div
      className="mt-3 rounded-lg border border-alertRed/30 bg-alertRed-light px-3 py-2 text-xs text-alertRed flex gap-3 items-start justify-between"
      role="alert"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded border border-alertRed/40/60 px-2 py-0.5 text-[11px] hover:bg-alertRed-light"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
