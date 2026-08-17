import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { PrimaryButton } from "../ui/PrimaryButton";
import { ViaLogo } from "../brand/ViaLogo";
import { getToken, signOut } from "../../api";

const PUBLIC_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#professional-review", label: "Professional review" }
];

export function Header({ signedIn }: { signedIn?: boolean }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const authed = signedIn ?? Boolean(getToken());

  function handleSignOut() {
    signOut();
    nav("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-5 py-4 lg:px-8">
        <Link
          to={authed ? "/sessions" : "/"}
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <ViaLogo />
        </Link>

        {!authed && (
          <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
            {PUBLIC_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-navy-700 transition-colors hover:text-accent-dark"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="hidden items-center gap-3 lg:flex">
          {authed ? (
            <>
              <Link to="/sessions" className="text-sm font-medium text-navy hover:text-accent-dark">
                Home
              </Link>
              <Link to="/privacy" className="text-sm font-medium text-navy hover:text-accent-dark">
                Privacy
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm font-medium text-navy-700 hover:text-accent-dark"
              >
                Sign out
              </button>
              <PrimaryButton href="/start">Continue assessment</PrimaryButton>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-navy hover:text-accent-dark">
                Sign in
              </Link>
              <PrimaryButton href="/login">Start assessment</PrimaryButton>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded p-2 text-navy lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-surface-border bg-white px-5 py-4 lg:hidden">
          <nav aria-label="Main mobile" className="grid gap-1">
            {(authed
              ? [
                  { href: "/sessions", label: "Home" },
                  { href: "/start", label: "Assessment" },
                  { href: "/privacy", label: "Privacy" }
                ]
              : PUBLIC_LINKS
            ).map((link) => (
              <Link
                key={link.href}
                to={link.href.startsWith("/#") ? "/" : link.href}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2 text-sm text-navy-700 hover:bg-surface-muted"
              >
                {link.label}
              </Link>
            ))}
            {authed && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="rounded px-2 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted"
              >
                Sign out
              </button>
            )}
          </nav>
          <div className="mt-3">
            <PrimaryButton href={authed ? "/start" : "/login"} fullWidth>
              {authed ? "Continue assessment" : "Start assessment"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </header>
  );
}
