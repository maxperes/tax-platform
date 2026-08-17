interface Props {
  value: number;
  label?: string;
  showValue?: boolean;
}

export function ProgressBar({ value, label, showValue = true }: Props) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="mb-2 flex items-baseline justify-between text-xs font-medium text-navy-700">
          {label && <span>{label}</span>}
          {showValue && <span className="tabular-nums">{safe}%</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100"
        role="progressbar"
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
