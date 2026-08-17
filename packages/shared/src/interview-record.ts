export const NOT_SURE = "not_sure";

export type InterviewAnswerValue = string | string[];
export type InterviewAnswers = Record<string, InterviewAnswerValue | undefined>;

export type InterviewDocumentStatus =
  | "available"
  | "missing"
  | "not_applicable"
  | "needs_review";
export type InterviewDocumentStatuses = Record<string, InterviewDocumentStatus | undefined>;

export type InterviewIncomeFollowUp = {
  amount?: string;
  originCountry?: string;
  withholding?: string;
  currency?: string;
};

export type InterviewRecordMeta = {
  source?: "interview" | "copilot" | "merged";
  projectedKeys?: string[];
};

export type InterviewRecord = {
  answers: InterviewAnswers;
  documents: InterviewDocumentStatuses;
  followUps: Record<string, InterviewIncomeFollowUp | undefined>;
  assessmentComplete: boolean;
  documentsComplete: boolean;
  reviewRequested: boolean;
  meta?: InterviewRecordMeta;
};

export function emptyInterviewRecord(): InterviewRecord {
  return {
    answers: {},
    documents: {},
    followUps: {},
    assessmentComplete: false,
    documentsComplete: false,
    reviewRequested: false
  };
}

export function parseInterviewRecord(raw: unknown): InterviewRecord {
  const empty = emptyInterviewRecord();
  if (!raw || typeof raw !== "object") return empty;
  const value = raw as Partial<InterviewRecord>;
  const meta =
    value.meta && typeof value.meta === "object"
      ? {
          source: value.meta.source,
          projectedKeys: Array.isArray(value.meta.projectedKeys)
            ? value.meta.projectedKeys.filter((k): k is string => typeof k === "string")
            : undefined
        }
      : undefined;
  return {
    answers: value.answers ?? {},
    documents: value.documents ?? {},
    followUps: value.followUps ?? {},
    assessmentComplete: Boolean(value.assessmentComplete),
    documentsComplete: Boolean(value.documentsComplete),
    reviewRequested: Boolean(value.reviewRequested),
    meta
  };
}

function isEmptyAnswer(value: InterviewAnswerValue | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.length === 0;
}

/** Merge projected answers into an existing interview. Projected keys overwrite; other keys are preserved. */
export function mergeInterviewRecords(
  existing: InterviewRecord,
  projected: InterviewRecord
): InterviewRecord {
  const projectedKeys = new Set<string>([
    ...(existing.meta?.projectedKeys ?? []),
    ...Object.keys(projected.answers)
  ]);
  const answers: InterviewAnswers = { ...existing.answers };

  for (const [key, value] of Object.entries(projected.answers)) {
    if (value === undefined) continue;
    const prior = answers[key];
    if (isEmptyAnswer(prior) || (existing.meta?.projectedKeys ?? []).includes(key)) {
      answers[key] = value;
    } else if (Array.isArray(value) && Array.isArray(prior)) {
      answers[key] = Array.from(new Set([...prior, ...value]));
    }
  }

  const source =
    existing.meta?.source === "interview" || Object.keys(existing.answers).length > 0
      ? projected.meta?.source === "copilot"
        ? "merged"
        : existing.meta?.source ?? "interview"
      : projected.meta?.source ?? "copilot";

  return {
    answers,
    documents: { ...existing.documents, ...projected.documents },
    followUps: { ...existing.followUps, ...projected.followUps },
    assessmentComplete: existing.assessmentComplete || projected.assessmentComplete,
    documentsComplete: existing.documentsComplete || projected.documentsComplete,
    reviewRequested: existing.reviewRequested || projected.reviewRequested,
    meta: {
      source,
      projectedKeys: Array.from(projectedKeys)
    }
  };
}
