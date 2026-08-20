type Props = {
  input: string;
  sending: boolean;
  lastSavedAt: string;
  hint?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatInput({ input, sending, lastSavedAt, hint, onInputChange, onSend }: Props) {
  const saveStatus = sending ? "Saving…" : lastSavedAt ? `Saved ${lastSavedAt}` : null;

  return (
    <footer className="shrink-0 border-t border-surface-border bg-white px-4 py-3 sm:px-5 lg:px-6">
      {hint && <p className="mb-2 text-xs leading-relaxed text-navy-700/70">{hint}</p>}
      <div className="flex items-end gap-2">
        <textarea
          id="chat-input"
          aria-label="Your answer"
          className="field-input min-h-[2.75rem] max-h-32 flex-1 resize-y py-2.5"
          placeholder="Type your answer…"
          value={input}
          rows={1}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="button"
          disabled={sending}
          onClick={onSend}
          className="self-end rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {saveStatus && <p className="mt-1.5 text-[11px] text-navy-700/55">{saveStatus}</p>}
    </footer>
  );
}
