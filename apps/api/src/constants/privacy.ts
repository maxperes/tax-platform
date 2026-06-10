export const CONSENT_PURPOSE_TERMS = "terms_and_privacy_v1";
export const CONSENT_PURPOSE_SENSITIVE = "sensitive_data_processing_v1";

export const PRIVACY_AUDIT_EVENTS = {
  consentGranted: "consent_granted",
  consentRevoked: "consent_revoked",
  exportRequested: "export_requested",
  deletionRequested: "deletion_requested",
  deletionCompleted: "deletion_completed"
} as const;

export type PrivacyAuditEventType =
  (typeof PRIVACY_AUDIT_EVENTS)[keyof typeof PRIVACY_AUDIT_EVENTS];
