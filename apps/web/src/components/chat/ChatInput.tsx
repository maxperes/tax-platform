type Props = {
  input: string;
  sending: boolean;
  lastSavedAt: string;
  lastSavedSnippet: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ChatInput({ input, sending, lastSavedAt, lastSavedSnippet, onInputChange, onSend }: Props) {
  return (
    <footer className="border-t border-slate-800 px-4 py-4">
      <div className="mb-2 text-xs text-slate-400">
        {sending
          ? "Saving your message..."
          : lastSavedAt
            ? `Saved automatically at ${lastSavedAt}${lastSavedSnippet ? ` · "${lastSavedSnippet}"` : ""}`
            : "Messages are saved automatically."}
      </div>
      <div className="flex gap-2">
        <textarea
          id="chat-input"
          aria-label="Your answer"
          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[2.5rem] max-h-32 resize-y"
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
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium disabled:opacity-50 self-end"
        >
          Send
        </button>
      </div>
    </footer>
  );
}
