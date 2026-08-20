export const NOT_SURE = "not_sure";

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue | undefined>;

export type DocumentStatus = "available" | "missing" | "not_applicable" | "needs_review";
export type DocumentStatuses = Record<string, DocumentStatus | undefined>;

export type IncomeFollowUp = {
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
  answers: Answers;
  documents: DocumentStatuses;
  followUps: Record<string, IncomeFollowUp | undefined>;
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

export type StepStatus = "not_started" | "in_progress" | "complete";

export type FindingStatus =
  | "information_complete"
  | "additional_document_needed"
  | "professional_review_recommended"
  | "potential_tax_issue"
  | "not_yet_analyzed";

export type AttentionLevel = "low_attention" | "review_recommended" | "professional_analysis_required";

export interface Option {
  value: string;
  label: string;
  description?: string;
}

export type QuestionType = "text" | "date" | "number" | "select" | "radio" | "multiselect" | "stays";

export interface QuestionDef {
  id: string;
  label: string;
  help?: string;
  type: QuestionType;
  options?: Option[];
  required?: boolean;
  allowNotSure?: boolean;
  placeholder?: string;
}

export interface StepDef {
  id: string;
  title: string;
  intro: string;
  questions: QuestionDef[];
}
