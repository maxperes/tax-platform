import type { RefObject } from "react";
import { renderChatEmphasis } from "../../lib/chat-utils";
import type { SessionNotice } from "../../lib/chat-notices";

type Props = {
  open: boolean;
  notices: SessionNotice[];
  readIds: Set<string>;
  onToggle: () => void;
  containerRef: RefObject<HTMLDivElement>;
};

export function NotificationCenter({ open, notices, readIds, onToggle, containerRef }: Props) {
  const unreadCount = notices.filter((n) => !readIds.has(n.id)).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-600 flex items-center gap-2"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Notifications
        {unreadCount > 0 && (
          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Notification center"
        >
          <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
            Alerts &amp; notices
          </div>
          <div className="px-3 py-2 space-y-3 text-xs">
            {notices.length === 0 ? (
              <p className="text-slate-500">No notices for this session.</p>
            ) : (
              notices.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-md border px-2 py-2 ${
                    n.kind === "welcome"
                      ? "border-sky-800/60 bg-sky-950/40 text-sky-100"
                      : "border-amber-800/50 bg-amber-950/35 text-amber-100"
                  }`}
                >
                  <p className="font-semibold text-slate-100">{n.title}</p>
                  <p className="mt-1 text-slate-300 leading-snug">
                    {n.kind === "review" ? renderChatEmphasis(n.body) : n.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
