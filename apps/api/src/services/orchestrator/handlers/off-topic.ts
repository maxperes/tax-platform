import type { ConversationState } from "@tax-platform/shared";
import { isLikelyOffTopicUserMessage, lastAssistantContent } from "../intents.js";
import { offTopicRedirect } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleOffTopic(h: HandlerContext): Promise<HandlerResult> {
  if (!isLikelyOffTopicUserMessage(h.session.state as ConversationState, h.ctx, h.userContent, lastAssistantContent(h.messages))) {
    return null;
  }
  return {
    assistantText: await offTopicRedirect(
      h.session.state as ConversationState,
      h.session.taxYear,
      h.ctx,
      h.session.userId
    )
  };
}
