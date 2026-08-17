"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AnswerValue, DemoRecord, DocumentStatus } from "@/lib/types";
import { clearRecord, emptyRecord, readRecord, writeRecord } from "@/lib/storage";
import { SAMPLE_RECORD } from "@/lib/fallback";

interface DemoDataValue {
  record: DemoRecord;
  /** False until the browser value has been read, so the first paint matches the server. */
  hydrated: boolean;
  setAnswer: (id: string, value: AnswerValue | undefined) => void;
  setDocumentStatus: (id: string, status: DocumentStatus | undefined) => void;
  markAssessmentComplete: () => void;
  markDocumentsComplete: () => void;
  markReviewRequested: () => void;
  loadSample: () => void;
  clear: () => void;
}

const DemoDataContext = createContext<DemoDataValue | null>(null);

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<DemoRecord>(emptyRecord);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecord(readRecord());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => writeRecord(record), 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [record, hydrated]);

  const patch = useCallback((changes: Partial<DemoRecord>) => {
    setRecord((current) => ({
      ...current,
      ...changes,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const setAnswer = useCallback(
    (id: string, value: AnswerValue | undefined) => {
      setRecord((current) => {
        const answers = { ...current.answers };
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
          delete answers[id];
        } else {
          answers[id] = value;
        }
        return { ...current, answers, updatedAt: new Date().toISOString() };
      });
    },
    [],
  );

  const setDocumentStatus = useCallback(
    (id: string, status: DocumentStatus | undefined) => {
      setRecord((current) => {
        const documents = { ...current.documents };
        if (status === undefined) delete documents[id];
        else documents[id] = status;
        return { ...current, documents, updatedAt: new Date().toISOString() };
      });
    },
    [],
  );

  const value = useMemo<DemoDataValue>(
    () => ({
      record,
      hydrated,
      setAnswer,
      setDocumentStatus,
      markAssessmentComplete: () => patch({ assessmentComplete: true }),
      markDocumentsComplete: () => patch({ documentsComplete: true }),
      markReviewRequested: () => patch({ reviewRequested: true }),
      loadSample: () =>
        setRecord({ ...SAMPLE_RECORD, updatedAt: new Date().toISOString() }),
      clear: () => {
        clearRecord();
        setRecord(emptyRecord());
      },
    }),
    [record, hydrated, patch, setAnswer, setDocumentStatus],
  );

  return (
    <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>
  );
}

export function useDemoData(): DemoDataValue {
  const context = useContext(DemoDataContext);
  if (!context) {
    throw new Error("useDemoData must be used inside DemoDataProvider");
  }
  return context;
}
