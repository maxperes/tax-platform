import { renderChatEmphasis, roleLabel } from "../../lib/chat-utils";

type Message = { id: string; role: string; content: string };

type Props = {
  messages: Message[];
  assistantTyping: boolean;
  typingDots: string;
  streamingText: string;
  chatError: string | null;
  onRetry?: () => void;
};

export function MessageList({
  messages,
  assistantTyping,
  typingDots,
  streamingText,
  chatError,
  onRetry
}: Props) {
  return (
    <main className="chat-scrollbar flex-1 overflow-y-auto space-y-3 px-4 py-4" aria-live="polite" aria-relevant="additions">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-xl px-4 py-2 max-w-[85%] ${
            m.role === "user"
              ? "ml-auto bg-accent-light border border-accent/30"
              : "mr-auto bg-surface-muted border border-surface-border"
          }`}
        >
          <p className="text-xs uppercase text-navy-700/60 mb-1">{roleLabel(m.role)}</p>
          <p className="whitespace-pre-wrap text-sm">{renderChatEmphasis(m.content)}</p>
        </div>
      ))}
      {streamingText && (
        <div className="rounded-xl px-4 py-2 max-w-[85%] mr-auto bg-white border border-surface-border">
          <p className="text-xs uppercase text-navy-700/60 mb-1">Assistant</p>
          <p className="whitespace-pre-wrap text-sm">{renderChatEmphasis(streamingText)}</p>
        </div>
      )}
      {assistantTyping && !streamingText && (
        <div className="rounded-xl px-4 py-2 max-w-[85%] mr-auto bg-white border border-surface-border">
          <p className="text-xs uppercase text-navy-700/60 mb-1">Assistant</p>
          <p className="whitespace-pre-wrap text-sm text-navy-700">Typing{typingDots}</p>
        </div>
      )}
      {chatError && (
        <div
          className="rounded-lg border border-alertRed/30 bg-alertRed-light px-4 py-3 text-sm text-alertRed"
          role="alert"
        >
          <p>{chatError}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 text-accent-dark hover:underline">
              Retry last message
            </button>
          )}
        </div>
      )}
      <div id="chat-end" />
    </main>
  );
}
