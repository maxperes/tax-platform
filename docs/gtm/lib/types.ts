export const NOT_SURE = "not_sure";

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue | undefined>;

export type DocumentStatus =
  | "available"
  | "missing"
  | "not_applicable"
  | "needs_review";

export type DocumentStatuses = Record<string, DocumentStatus | undefined>;

export interface DemoRecord {
  version: 1;
  answers: Answers;
  documents: DocumentStatuses;
  assessmentComplete: boolean;
  documentsComplete: boolean;
  reviewRequested: boolean;
  updatedAt: string | null;
}

export type StepStatus = "not_started" | "in_progress" | "complete";

export type FindingStatus =
  | "information_complete"
  | "additional_document_needed"
  | "professional_review_recommended"
  | "potential_tax_issue"
  | "not_yet_analyzed";

export type AttentionLevel =
  | "low_attention"
  | "review_recommended"
  | "professional_analysis_required";

export interface Option {
  value: string;
  label: string;
  description?: string;
}

export type QuestionType =
  | "text"
  | "date"
  | "number"
  | "select"
  | "radio"
  | "multiselect"
  | "stays";

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
