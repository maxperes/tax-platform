import { trustConcernResponseWithTone } from "../messages.js";
import { isTrustOrComplianceConcern } from "../intents.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";
import type { ConversationState } from "@tax-platform/shared";

export async function handleTrust(h: HandlerContext): Promise<HandlerResult> {
  if (!isTrustOrComplianceConcern(h.userContent)) return null;
  const assistantText = await trustConcernResponseWithTone(
    h.session.state as ConversationState,
    h.session.taxYear,
    h.ctx,
    h.userContent,
    h.session.userId
  );
  return { assistantText };
}
