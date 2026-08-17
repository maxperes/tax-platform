"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Check, Circle, CircleDashed } from "lucide-react";
import { useDemoData } from "@/context/DemoDataProvider";
import { assessmentPercent, documentsPercent } from "@/lib/derive";
import type { StepStatus } from "@/lib/types";

const ITEMS = [
  { href: "/assessment", label: "Assessment" },
  { href: "/documents", label: "Documents" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/report", label: "Report" },
];

const ICONS: Record<StepStatus, ReactNode> = {
  complete: <Check className="h-3.5 w-3.5 text-accent-dark" aria-hidden="true" />,
  in_progress: <Circle className="h-3 w-3 text-navy-500" aria-hidden="true" />,
  not_started: (
    <CircleDashed className="h-3.5 w-3.5 text-navy-700/40" aria-hidden="true" />
  ),
};

const STATUS_TEXT: Record<StepStatus, string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
};

export default function AssessmentNav() {
  const pathname = usePathname();
  const { record, hydrated } = useDemoData();

  const assessment = assessmentPercent(record);
  const documents = documentsPercent(record);

  const statusFor = (href: string): StepStatus => {
    if (!hydrated) return "not_started";
    if (href === "/assessment") {
      if (record.assessmentComplete || assessment === 100) return "complete";
      return assessment > 0 ? "in_progress" : "not_started";
    }
    if (href === "/documents") {
      if (record.documentsComplete || documents === 100) return "complete";
      return documents > 0 ? "in_progress" : "not_started";
    }
    if (href === "/dashboard") {
      return record.assessmentComplete ? "complete" : "not_started";
    }
    return record.reviewRequested
      ? "complete"
      : record.assessmentComplete
        ? "in_progress"
        : "not_started";
  };

  return (
    <div className="border-b border-surface-border bg-white">
      <div className="mx-auto max-w-content px-5 lg:px-8">
        <nav aria-label="Assessment sections">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {ITEMS.map((item) => {
              const active = pathname === item.href;
              const status = statusFor(item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                      active
                        ? "border-accent text-navy"
                        : "border-transparent text-navy-700/70 hover:border-navy-100 hover:text-navy"
                    }`}
                  >
                    {ICONS[status]}
                    <span>{item.label}</span>
                    <span className="sr-only">{STATUS_TEXT[status]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
