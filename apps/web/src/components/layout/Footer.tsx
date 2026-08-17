import { Link } from "react-router-dom";
import { ViaLogo } from "../brand/ViaLogo";

export function Footer() {
  return (
    <footer className="border-t border-surface-border bg-white">
      <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <ViaLogo withTagline />
            <p className="mt-3 text-sm leading-relaxed text-slate">
              VIA maps your tax life so you can move forward with clarity and confidence.
            </p>
          </div>

          <nav aria-label="Footer" className="grid gap-2 text-sm">
            <Link to="/#how-it-works" className="text-navy-700 hover:text-accent-dark">
              How it works
            </Link>
            <Link to="/sessions" className="text-navy-700 hover:text-accent-dark">
              Home
            </Link>
            <Link to="/privacy" className="text-navy-700 hover:text-accent-dark">
              Privacy
            </Link>
          </nav>
        </div>

        <div className="mt-10 border-t border-surface-border pt-6">
          <p className="text-xs leading-relaxed text-slate">
            Nothing here is legal, tax or accounting advice. No filing or financial decision should
            be based on this map without professional review. Estimates are preliminary orientation
            only.
          </p>
        </div>
      </div>
    </footer>
  );
}
