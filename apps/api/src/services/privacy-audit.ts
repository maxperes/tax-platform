import { Prisma } from "../prisma-client.js";
import { prisma } from "../db.js";
import type { PrivacyAuditEventType } from "../constants/privacy.js";

export async function logPrivacyAuditEvent(
  eventType: PrivacyAuditEventType,
  userId: string | null,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  await prisma.privacyAuditEvent.create({
    data: {
      eventType,
      userId,
      metadata
    }
  });
}
