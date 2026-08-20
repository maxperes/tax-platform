import { useEffect, useRef, useState, type RefObject } from "react";
import { MoreHorizontal } from "lucide-react";
import { ViaLogo } from "../brand/ViaLogo";
import { NotificationCenter } from "./NotificationCenter";
import { StepPills } from "./StepPills";
import type { SessionNotice } from "../../lib/chat-notices";

type Props = {
  taxYear: number;
  stepLabel: string;
  currentState: string;
  progressIndex: number;
  progressTotal: number;
  jumpDisabled: boolean;
  onJump: (state: string) => void;
  notices: SessionNotice[];
  noticeCenterOpen: boolean;
  readNoticeIds: Set<string>;
  noticeCenterRef: RefObject<HTMLDivElement>;
  onToggleNotices: () => void;
  showMapCta: boolean;
  syncingMap: boolean;
  onOpenMap: () => void;
  resetting: boolean;
  onStartOver: () => void;
  onSignOut: () => void;
};

const menuItemClass =
  "block w-full px-3 py-2 text-left text-sm text-navy hover:bg-surface-muted no-underline";

const mapButtonClass =
  "inline-flex items-center rounded-md border border-accent/40 bg-accent-light px-3 py-1.5 text-xs font-medium text-accent-dark hover:bg-accent-light/80 disabled:opacity-50";

export function ChatSessionHeader({
  taxYear,
  stepLabel,
  currentState,
  progressIndex,
  progressTotal,
  jumpDisabled,
  onJump,
  notices,
  noticeCenterOpen,
  readNoticeIds,
  noticeCenterRef,
  onToggleNotices,
  showMapCta,
  syncingMap,
  onOpenMap,
  resetting,
  onStartOver,
  onSignOut
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="shrink-0 border-b border-surface-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/sessions" className="hidden shrink-0 sm:block" aria-label="VIA home">
            <ViaLogo />
          </a>
          <div className="min-w-0 sm:border-l sm:border-surface-border sm:pl-3">
            <h1 className="truncate text-sm font-semibold text-navy sm:text-base">Copilot</h1>
            <p className="truncate text-xs text-navy-700/75">
              {taxYear} · {stepLabel}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <StepPills
            currentState={currentState}
            progressIndex={progressIndex}
            progressTotal={progressTotal}
            disabled={jumpDisabled}
            onJump={onJump}
          />
          {showMapCta && (
            <button type="button" disabled={syncingMap} onClick={onOpenMap} className={`${mapButtonClass} hidden sm:inline-flex`}>
              {syncingMap ? "Building map…" : "View map"}
            </button>
          )}
          <NotificationCenter
            open={noticeCenterOpen}
            notices={notices}
            readIds={readNoticeIds}
            onToggle={onToggleNotices}
            containerRef={noticeCenterRef}
          />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex items-center justify-center rounded-md border border-surface-border bg-white p-2 text-navy hover:border-accent"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Session menu"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-md border border-surface-border bg-white py-1 shadow-card"
              >
                {showMapCta && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={syncingMap}
                    className={`${menuItemClass} sm:hidden disabled:opacity-50`}
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenMap();
                    }}
                  >
                    {syncingMap ? "Building map…" : "View 360° tax map"}
                  </button>
                )}
                <a href="/sessions" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                  Home
                </a>
                <a href="/start" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                  Assessment
                </a>
                <a href="/privacy" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                  Privacy
                </a>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={resetting}
                  className={`${menuItemClass} disabled:opacity-50`}
                  onClick={() => {
                    setMenuOpen(false);
                    onStartOver();
                  }}
                >
                  {resetting ? "Starting over…" : "Start over"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
