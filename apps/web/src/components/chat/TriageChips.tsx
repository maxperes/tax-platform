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
      <p className="text-xs text-slate-400">Choose your focus (tap to prefill, then Send):</p>
      <div className="flex flex-wrap gap-2">
        {TRIAGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.id)}
            className="rounded-full border border-sky-700 bg-sky-950 px-3 py-1 text-xs text-sky-200 hover:border-sky-500 disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
