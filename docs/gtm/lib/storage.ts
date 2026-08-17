import type { DemoRecord } from "./types";

export const STORAGE_KEY = "gtm.demo.v1";

export function emptyRecord(): DemoRecord {
  return {
    version: 1,
    answers: {},
    documents: {},
    assessmentComplete: false,
    documentsComplete: false,
    reviewRequested: false,
    updatedAt: null,
  };
}

function isRecordShape(value: unknown): value is DemoRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DemoRecord>;
  return (
    candidate.version === 1 &&
    typeof candidate.answers === "object" &&
    candidate.answers !== null &&
    typeof candidate.documents === "object" &&
    candidate.documents !== null
  );
}

/** Reads the demo record. Returns an empty record on the server or on any failure. */
export function readRecord(): DemoRecord {
  if (typeof window === "undefined") return emptyRecord();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyRecord();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecordShape(parsed)) return emptyRecord();
    return { ...emptyRecord(), ...parsed };
  } catch {
    return emptyRecord();
  }
}

export function writeRecord(record: DemoRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage can be full or blocked in private browsing. The demo still works in memory.
  }
}

export function clearRecord(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the in-memory state is reset by the provider anyway.
  }
}
