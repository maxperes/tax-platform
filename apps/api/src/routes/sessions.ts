import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { CONVERSATION_STATES, fiscalResidenceSchema } from "@tax-platform/shared";
import {
  buildAssistantMessageForExistingFiscalProfile,
  handleUserMessage,
  initialAssistantMessage
} from "../services/orchestrator.js";
import { streamAssistantReply } from "../services/llm.js";
import { config } from "../config.js";

export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware);

sessionsRouter.get("/", async (req, res) => {
  const list = await prisma.conversationSession.findMany({
    where: { userId: req.user!.sub },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  res.json(list);
});

sessionsRouter.post("/", async (req, res) => {
  const body = z.object({ taxYear: z.number().int().min(2000).max(2100) }).parse(req.body);
  const userId = req.user!.sub;
  const existingProfile = await prisma.fiscalResidenceProfile.findUnique({
    where: { userId_taxYear: { userId, taxYear: body.taxYear } }
  });
  let contextJson: Record<string, unknown> = {};
  let firstMessage = initialAssistantMessage();
  if (existingProfile?.data) {
    const parsed = fiscalResidenceSchema.safeParse(existingProfile.data);
    if (parsed.success) {
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
});

sessionsRouter.get("/:id", async (req, res) => {
  const session = await prisma.conversationSession.findFirst({
    where: { id: req.params.id, userId: req.user!.sub },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(session);
});

sessionsRouter.post("/:id/messages", async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const session = await prisma.conversationSession.findFirst({
    where: { id: req.params.id, userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await handleUserMessage(session.id, body.content);
  res.json(result);
});

sessionsRouter.post("/:id/advance", async (req, res) => {
  const body = z.object({ state: z.enum(CONVERSATION_STATES) }).parse(req.body);
  const session = await prisma.conversationSession.findFirst({
    where: { id: req.params.id, userId: req.user!.sub }
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
});

/** SSE: stream assistant reply for the last user message (MVP: one-shot stream after POST). */
sessionsRouter.post("/:id/messages/stream", async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const session = await prisma.conversationSession.findFirst({
    where: { id: req.params.id, userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!config.llmEnabled) {
    res
      .status(400)
      .json({ error: "LLM not configured (set OPENAI_API_KEY and/or OPENAI_BASE_URL for a local server)" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  await prisma.conversationMessage.create({
    data: { sessionId: session.id, role: "user", content: body.content }
  });

  const messages = await prisma.conversationMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 40
  });
  const history = messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content
  }));
  const systemPrompt = `You are a warm tax intake assistant. Step: ${session.state}. Be concise.`;

  let full = "";
  await streamAssistantReply({
    systemPrompt,
    userMessages: history,
    onDelta: (t) => {
      full += t;
      res.write(`data: ${JSON.stringify({ delta: t })}\n\n`);
    }
  });
  await prisma.conversationMessage.create({
    data: { sessionId: session.id, role: "assistant", content: full || "(no content)" }
  });
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});
