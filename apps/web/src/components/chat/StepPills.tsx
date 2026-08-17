import { STEP_ORDER } from "../../lib/chat-constants";

type Props = {
  currentState: string;
  progressIndex: number;
  disabled: boolean;
  onJump: (state: string) => void;
};

export function StepPills({ currentState, progressIndex, disabled, onJump }: Props) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 md:flex-nowrap md:overflow-x-auto md:pb-1">
      {STEP_ORDER.map((step, idx) => {
        const active = step.id === currentState;
        const completed = idx + 1 < progressIndex;
        return (
          <button
            key={step.id}
            type="button"
            disabled={disabled}
            aria-current={active ? "step" : undefined}
            onClick={() => onJump(step.id)}
            className={`rounded-full px-2 py-1 text-xs border shrink-0 ${
              active
                ? "border-accent bg-accent-light text-accent-dark"
                : completed
                  ? "border-surface-border bg-surface-muted text-navy"
                  : "border-surface-border bg-white text-navy-700/75"
            } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-accent"}`}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
