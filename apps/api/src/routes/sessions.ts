import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../prisma-client.js";
import { prisma } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { CONVERSATION_STATES, fiscalResidenceSchema } from "@tax-platform/shared";
import {
  buildAssistantMessageForExistingFiscalProfile,
  handleUserMessage,
  initialAssistantMessage
} from "../services/orchestrator.js";

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
      contextJson = { _triagePending: true, _fiscalProfileConfirmPending: true };
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
  const session = await prisma.conversationSession.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub },
    include: { messages: { orderBy: { createdAt: "asc" } } }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(session);
}));

sessionsRouter.post("/:id/messages", asyncHandler(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const session = await prisma.conversationSession.findFirst({
    where: { id: String(req.params.id), userId: req.user!.sub }
  });
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const result = await handleUserMessage(session.id, body.content);
  res.json(result);
}));

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

/** SSE: same orchestrator pipeline as POST /messages; streams the final assistant text in chunks. */
sessionsRouter.post("/:id/messages/stream", asyncHandler(async (req, res) => {
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

  const result = await handleUserMessage(session.id, body.content);
  const chunkSize = 80;
  for (let i = 0; i < result.assistantText.length; i += chunkSize) {
    res.write(`data: ${JSON.stringify({ delta: result.assistantText.slice(i, i + chunkSize) })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ done: true, sessionState: result.sessionState })}\n\n`);
  res.end();
}));
