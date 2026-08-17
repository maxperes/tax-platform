"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useDemoData } from "@/context/DemoDataProvider";

export default function ClearDemoDataButton() {
  const { clear } = useDemoData();
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  if (cleared) {
    return (
      <p className="text-xs font-medium text-navy">
        Demo data cleared from this browser.
      </p>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 md:justify-end">
        <span className="text-xs text-navy-700/75">Delete every answer?</span>
        <button
          type="button"
          onClick={() => {
            clear();
            setCleared(true);
          }}
          className="rounded border border-alertRed/40 bg-alertRed-light px-3 py-1.5 text-xs font-semibold text-alertRed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-1.5 text-xs font-medium text-navy-700 hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Keep
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-xs font-semibold text-navy-700 transition-colors hover:border-navy-500/40 hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      Clear demo data
    </button>
  );
}
