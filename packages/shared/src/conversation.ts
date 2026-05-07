import { z } from "zod";
import { CONVERSATION_STATES } from "./constants.js";

export const conversationMessageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);

export const conversationMessageSchema = z.object({
  role: conversationMessageRoleSchema,
  content: z.string(),
  toolCalls: z.array(z.record(z.string(), z.unknown())).optional(),
  structuredPayload: z.record(z.string(), z.unknown()).optional()
});

export const conversationSessionSchema = z.object({
  taxYear: z.number().int(),
  state: z.enum(CONVERSATION_STATES),
  contextJson: z.record(z.string(), z.unknown()).optional(),
  requiresAdditionalReview: z.boolean().default(false)
});

export type ConversationMessageInput = z.infer<typeof conversationMessageSchema>;
