import { STEP_ORDER } from "../../lib/chat-constants";

type StepItem = { id: string; label: string };

type Props = {
  currentState: string;
  progressIndex: number;
  progressTotal: number;
  disabled: boolean;
  onJump: (state: string) => void;
  steps?: readonly StepItem[];
};

export function StepPills({
  currentState,
  progressIndex,
  progressTotal,
  disabled,
  onJump,
  steps = STEP_ORDER
}: Props) {
  const pct = Math.round((progressIndex / progressTotal) * 100);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 tabular-nums text-xs text-navy-700/75 sm:inline">
        {progressIndex}/{progressTotal}
      </span>
      <div
        className="hidden h-1 w-14 overflow-hidden rounded-full bg-navy-100 sm:block"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Session progress"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <select
        aria-label="Jump to step"
        value={currentState}
        disabled={disabled}
        onChange={(e) => onJump(e.target.value)}
        className="field-input w-[9.5rem] shrink-0 py-1.5 text-xs sm:w-44"
      >
        {(steps as readonly StepItem[]).map((step, idx) => (
          <option key={step.id} value={step.id}>
            {idx + 1}. {step.label}
          </option>
        ))}
      </select>
    </div>
  );
}
