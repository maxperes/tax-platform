type Props = {
  message: string;
  onDismiss?: () => void;
};

export function ActionBanner({ message, onDismiss }: Props) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border border-alertRed/30 bg-alertRed-light px-3 py-2.5 text-xs text-alertRed"
      role="alert"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md border border-alertRed/40 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-alertRed-light"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
