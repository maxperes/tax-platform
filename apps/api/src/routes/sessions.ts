import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../prisma-client.js";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { chatRateLimit } from "../middleware/rate-limit.js";
import { CONVERSATION_STATES, fiscalResidenceSchema } from "@tax-platform/shared";
import {
  buildAssistantMessageForExistingFiscalProfile,
  handleUserMessage,
  initialAssistantMessage
} from "../services/orchestrator.js";
import { syncSessionToTwin } from "../services/session-twin-sync.js";
import { LlmAdmissionError } from "../services/llm-admission.js";
import { logger } from "../services/logger.js";
import { incrMetric } from "../services/metrics.js";

export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware);

sessionsRouter.get("/", asyncHandler(async (req, res) => {
  const list = await prisma.conversationSession.findMany({
    where: { userId: req.user!.sub },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  res.json(list);
}));

sessionsRouter.post("/", asyncHandler(async (req, res) => {
  const body = z.object({ taxYear: z.number().int().min(2000).max(2100) }).parse(req.body);
  const userId = req.user!.sub;
  const existingProfile = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear: body.taxYear } }
  });
  let contextJson: Record<string, unknown> = { _triagePending: true };
  let firstMessage = initialAssistantMessage(body.taxYear);
  if (existingProfile?.data) {
    const parsed = fiscalResidenceSchema.safeParse(existingProfile.data);
    if (parsed.success) {
      // Confirm first — do not leave triage pending while asking yes/no.
      contextJson = { _fiscalProfileConfirmPending: true };
      firstMessage = buildAssistantMessageForExistingFiscalProfile({
        taxYear: body.taxYear,
        data: parsed.data,
        derivedProfile: existingProfile.derivedProfile,
        requiresAdditionalReview: existingProfile.requiresAdditionalReview
      });
    }
  }
  const session = await prisma.conversationSession.create({
    data: {
      userId,
      taxYear: body.taxYear,
      state: "fiscal_residence",
      contextJson: contextJson as Prisma.InputJsonValue
    }
  });
  await prisma.conversationMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: firstMessage
    }
  });
  res.status(201).json(session);
}));

sessionsRouter.get("/:id", asyncHandler(async (req, res) => {
  const limit = Math.min(
    500,
    Math.max(1, z.coerce.number().int().default(100).parse(req.query.limit ?? 100))
  );
  const before = typeof req.query.before === "string" ? req.query.before : undefined;

  const session = await prisma.conversationSession.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const messages = await prisma.conversationMessage.findMany({
    where: {
      sessionId: session.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  messages.reverse();

  res.json({
    ...session,
    messages,
    messagesPage: {
      limit,
      hasMore: messages.length === limit,
      oldestCreatedAt: messages[0]?.createdAt ?? null
    }
  });
}));

/** Deletes the chat thread and messages only — not year-level tax facts. */
sessionsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const session = await prisma.conversationSession.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await prisma.conversationSession.delete({ where: { id: session.id } });
  res.status(204).send();
}));

sessionsRouter.post(
  "/:id/messages",
  chatRateLimit,
  asyncHandler(async (req, res) => {
    const body = z.object({ content: z.string().min(1) }).parse(req.body);
    const session = await prisma.conversationSession.findFirst({
      where: { id: String(req.params.id), userId: req.user!.sub }
    });
    if (!session) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const result = await handleUserMessage(session.id, body.content);
      res.json(result);
    } catch (err) {
      if (err instanceof LlmAdmissionError) {
        res.setHeader("Retry-After", String(err.retryAfterSeconds));
        res.status(429).json({
          error: err.message,
          retryAfterSeconds: err.retryAfterSeconds
        });
        return;
      }
      throw err;
    }
  })
);

sessionsRouter.post("/:id/advance", asyncHandler(async (req, res) => {
  const body = z.object({ state: z.enum(CONVERSATION_STATES) }).parse(req.body);
  const session = await prisma.conversationSession.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await prisma.conversationSession.update({
    where: { id: session.id },
    data: { state: body.state }
  });
  res.json(updated);
}));

/** Project fiscal/income/asset session facts into the twin interview used by the 360° map. */
sessionsRouter.post(
  "/:id/sync-to-twin",
  asyncHandler(async (req, res) => {
    const result = await syncSessionToTwin(req.user!.sub, String(req.params.id));
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result);
  })
);

/**
 * True token SSE when the LLM path runs; tool_start/tool_done status events; no sticky sessions.
 */
sessionsRouter.post(
  "/:id/messages/stream",
  chatRateLimit,
  asyncHandler(async (req, res) => {
    const body = z.object({ content: z.string().min(1) }).parse(req.body);
    const session = await prisma.conversationSession.findFirst({
      where: { id: String(req.params.id), userId: req.user!.sub }
    });
    if (!session) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const started = Date.now();
    try {
      const result = await handleUserMessage(session.id, body.content, (ev) => {
        if (ev.type === "delta") {
          writeEvent({ delta: ev.text });
        } else if (ev.type === "tool_start" || ev.type === "tool_done") {
          writeEvent({ event: ev.type, name: ev.name });
        } else if (ev.type === "status") {
          writeEvent({ event: "status", message: ev.message });
        }
      });
      writeEvent({ done: true, sessionState: result.sessionState });
      incrMetric("chat_stream_ok");
      logger.info("chat_stream_complete", {
        sessionId: session.id,
        ms: Date.now() - started,
        state: result.sessionState
      });
    } catch (err) {
      if (err instanceof LlmAdmissionError) {
        writeEvent({
          error: err.message,
          status: 429,
          retryAfterSeconds: err.retryAfterSeconds
        });
        incrMetric("chat_stream_429");
      } else {
        logger.error("chat_stream_failed", { error: String(err) });
        writeEvent({ error: "Internal server error", status: 500 });
      }
    }
    res.end();
  })
);
