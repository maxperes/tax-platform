import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { PRIVACY_AUDIT_EVENTS } from "../constants/privacy.js";
import { revokeActiveConsents } from "./consent.js";
import { logPrivacyAuditEvent } from "./privacy-audit.js";

export class InvalidPasswordError extends Error {
  constructor() {
    super("Invalid password");
    this.name = "InvalidPasswordError";
  }
}

export class DeletionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeletionBlockedError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

async function assertDeletionAllowed(userId: string): Promise<void> {
  if (!config.legalRetentionMode) {
    return;
  }

  const reportCount = await prisma.taxReport.count({ where: { userId } });
  if (reportCount > 0) {
    throw new DeletionBlockedError(
      "Account deletion is blocked while tax reports are retained for legal obligations. Contact support."
    );
  }
}

export async function deleteUserAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new UserNotFoundError();
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    throw new InvalidPasswordError();
  }

  await assertDeletionAllowed(userId);

  await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.deletionRequested, userId, {
    policyVersion: config.privacyPolicyVersion
  });

  await revokeActiveConsents(userId);

  await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.deletionCompleted, userId, {
    policyVersion: config.privacyPolicyVersion
  });

  await prisma.user.delete({ where: { id: userId } });
}

export async function deleteUserAccountAsAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new UserNotFoundError();
  }

  await assertDeletionAllowed(userId);

  await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.deletionRequested, userId, {
    initiatedBy: "admin",
    policyVersion: config.privacyPolicyVersion
  });

  await revokeActiveConsents(userId);

  await logPrivacyAuditEvent(PRIVACY_AUDIT_EVENTS.deletionCompleted, userId, {
    initiatedBy: "admin",
    policyVersion: config.privacyPolicyVersion
  });

  await prisma.user.delete({ where: { id: userId } });
}
