import { renderChatEmphasis } from "../../lib/chat-utils";

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
    <main className="chat-scrollbar flex-1 overflow-y-auto space-y-4 px-4 py-5 sm:px-5 lg:px-6" aria-live="polite" aria-relevant="additions">
      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="ml-auto max-w-[75%] rounded-lg bg-surface-muted px-3.5 py-2.5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">{renderChatEmphasis(m.content)}</p>
          </div>
        ) : (
          <div key={m.id} className="max-w-3xl">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">{renderChatEmphasis(m.content)}</p>
          </div>
        )
      )}
      {streamingText && (
        <div className="max-w-3xl">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy">{renderChatEmphasis(streamingText)}</p>
        </div>
      )}
      {assistantTyping && !streamingText && (
        <p className="text-sm text-navy-700/70">Typing{typingDots}</p>
      )}
      {chatError && (
        <div
          className="rounded-md border border-alertRed/30 bg-alertRed-light px-4 py-3 text-sm text-alertRed"
          role="alert"
        >
          <p>{chatError}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 text-sm font-medium text-accent-dark hover:underline">
              Retry last message
            </button>
          )}
        </div>
      )}
      <div id="chat-end" />
    </main>
  );
}
