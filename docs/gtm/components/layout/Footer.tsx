import Link from "next/link";
import ClearDemoDataButton from "./ClearDemoDataButton";
import ViaLogo from "@/components/brand/ViaLogo";

export default function Footer() {
  return (
    <footer className="border-t border-surface-border bg-white">
      <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <ViaLogo withTagline />
            <p className="mt-3 text-sm leading-relaxed text-slate">
              VIA maps your tax life so you can move forward with clarity and
              confidence.
            </p>
          </div>

          <nav aria-label="Footer" className="grid gap-2 text-sm">
            <Link href="/#how-it-works" className="text-navy-700 hover:text-accent-dark">
              How it works
            </Link>
            <Link href="/#features" className="text-navy-700 hover:text-accent-dark">
              Features
            </Link>
            <Link href="/#security" className="text-navy-700 hover:text-accent-dark">
              Security
            </Link>
            <Link href="/report" className="text-navy-700 hover:text-accent-dark">
              Demo report
            </Link>
          </nav>

          <div className="md:text-right">
            <ClearDemoDataButton />
          </div>
        </div>

        <div className="mt-10 border-t border-surface-border pt-6">
          <p className="text-xs leading-relaxed text-slate">
            Demonstration environment. Every figure shown in this prototype is
            fictitious. Nothing here is legal, tax or accounting advice, and no filing
            or financial decision should be based on it. Do not upload real or
            sensitive documents.
          </p>
        </div>
      </div>
    </footer>
  );
}
