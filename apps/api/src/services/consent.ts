import type { User } from "../prisma-client.js";
import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  CONSENT_PURPOSE_SENSITIVE,
  CONSENT_PURPOSE_TERMS,
  PRIVACY_AUDIT_EVENTS
} from "../constants/privacy.js";
import { logPrivacyAuditEvent } from "./privacy-audit.js";

type ConsentOptions = {
  ipAddress?: string;
};

export async function recordSignupConsent(
  userId: string,
  options: ConsentOptions = {}
): Promise<void> {
  const policyVersion = config.privacyPolicyVersion;
  const purposes = [CONSENT_PURPOSE_TERMS, CONSENT_PURPOSE_SENSITIVE];

  await prisma.consentRecord.createMany({
    data: purposes.map((purpose) => ({
      userId,
      purpose,
      policyVersion,
      ipAddress: options.ipAddress
    }))
  });

  for (const purpose of purposes) {
    await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.consentGranted, userId, {
      purpose,
      policyVersion
    });
  }
}

export async function createUserWithConsent(
  createUserFn: () => Promise<User>,
  options: ConsentOptions = {}
): Promise<User> {
  const user = await createUserFn();
  await recordSignupConsent(user.id, options);
  return user;
}

export async function revokeActiveConsents(userId: string): Promise<void> {
  const now = new Date();
  const active = await prisma.consentRecord.findMany({
    where: { userId, revokedAt: null }
  });

  if (active.length === 0) {
    return;
  }

  await prisma.consentRecord.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now }
  });

  for (const record of active) {
    await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.consentRevoked, userId, {
      purpose: record.purpose,
      policyVersion: record.policyVersion
    });
  }
}
