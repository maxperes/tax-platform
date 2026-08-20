import { TRIAGE_OPTIONS } from "../../lib/chat-constants";

type Props = {
  visible: boolean;
  disabled: boolean;
  onSelect: (optionId: string) => void;
};

export function TriageChips({ visible, disabled, onSelect }: Props) {
  if (!visible) return null;
  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs text-navy-700/75">Choose your focus (tap to prefill, then Send):</p>
      <div className="flex flex-wrap gap-2">
        {TRIAGE_OPTIONS.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(String(i + 1))}
            className="rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:border-accent disabled:opacity-50"
          >
            {i + 1}. {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
