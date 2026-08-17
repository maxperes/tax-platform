"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import PrimaryButton from "@/components/ui/PrimaryButton";
import ViaLogo from "@/components/brand/ViaLogo";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "/#professional-review", label: "Professional review" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-6 px-5 py-4 lg:px-8">
        <Link
          href="/"
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <ViaLogo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-navy-700 transition-colors hover:text-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/start"
            className="text-sm font-medium text-navy transition-colors hover:text-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Sign in
          </Link>
          <PrimaryButton href="/start">Start assessment</PrimaryButton>
        </div>

        <button
          type="button"
          className="rounded p-2 text-navy lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="border-t border-surface-border bg-white px-5 py-4 lg:hidden"
        >
          <nav aria-label="Main mobile" className="grid gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded px-2 py-2 text-sm text-navy-700 hover:bg-surface-muted"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/start"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-2 text-sm text-navy-700 hover:bg-surface-muted"
            >
              Sign in
            </Link>
          </nav>
          <div className="mt-3">
            <PrimaryButton href="/start" fullWidth>
              Start assessment
            </PrimaryButton>
          </div>
        </div>
      )}
    </header>
  );
}
