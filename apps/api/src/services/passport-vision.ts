import OpenAI from "openai";
import type { BrazilStay } from "@tax-platform/shared";
import { config } from "../config.js";
import { withLlmAdmission, withLlmTimeout } from "./llm-admission.js";

export type ExtractedPassportStay = BrazilStay & {
  confidence?: "high" | "medium" | "low";
  rawText?: string;
};

export type PassportVisionResult = {
  brazilStays: ExtractedPassportStay[];
  extractionSource: "passport_vision" | "skipped";
  notes?: string;
};

const IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const PDF_MIME = new Set(["application/pdf"]);

function isVisionCapable(): boolean {
  return Boolean(config.openaiApiKey && !config.openaiBaseUrl);
}

function mimeFromFileName(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return undefined;
}

function resolveMime(mimeType: string | undefined, fileName: string): string | undefined {
  const normalized = mimeType?.toLowerCase().split(";")[0]?.trim();
  if (normalized && (IMAGE_MIME.has(normalized) || PDF_MIME.has(normalized))) return normalized;
  return mimeFromFileName(fileName);
}

function parseVisionJson(raw: string): ExtractedPassportStay[] {
  const trimmed = raw.trim();
  const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? trimmed;
  const parsed = JSON.parse(jsonBlock) as { brazilStays?: unknown[] };
  const rows = Array.isArray(parsed.brazilStays) ? parsed.brazilStays : [];
  const stays: ExtractedPassportStay[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const entryDate = typeof rec.entryDate === "string" ? rec.entryDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) continue;
    const exitDate =
      typeof rec.exitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rec.exitDate)
        ? rec.exitDate
        : undefined;
    const confidence =
      rec.confidence === "high" || rec.confidence === "medium" || rec.confidence === "low"
        ? rec.confidence
        : undefined;
    const rawText = typeof rec.rawText === "string" ? rec.rawText : undefined;
    stays.push({ entryDate, exitDate, confidence, rawText });
  }
  return stays;
}

/**
 * Extract Brazil entry/exit stamp dates from a passport image using hosted vision.
 * Skipped when only a local OpenAI-compatible server is configured (no vision).
 */
export async function extractBrazilStaysFromPassportImage(
  bytes: Buffer,
  fileName: string,
  mimeType?: string
): Promise<PassportVisionResult> {
  if (!isVisionCapable()) {
    return {
      brazilStays: [],
      extractionSource: "skipped",
      notes: "Passport stamp vision requires hosted OpenAI (OPENAI_API_KEY without OPENAI_BASE_URL)."
    };
  }

  const mime = resolveMime(mimeType, fileName);
  if (!mime || (!IMAGE_MIME.has(mime) && !PDF_MIME.has(mime))) {
    return {
      brazilStays: [],
      extractionSource: "skipped",
      notes: "Unsupported file type for passport stamp vision."
    };
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  const systemPrompt =
    "You read passport entry/exit stamps for Brazil (Brasil). Return ONLY valid JSON with no markdown.";

  const userPrompt = `Extract Brazil entry and exit stamp dates from this passport page.

Rules:
- Only include stamps clearly for Brazil / BR / BRASIL / FEDERATIVE REPUBLIC OF BRAZIL immigration.
- Each stay needs entryDate in YYYY-MM-DD format.
- exitDate is optional (omit when only an entry stamp is visible).
- Never invent dates. If uncertain, omit that stamp.
- confidence is high, medium, or low.
- rawText is the stamp text you read.

Return JSON exactly:
{"brazilStays":[{"entryDate":"YYYY-MM-DD","exitDate":"YYYY-MM-DD","confidence":"high","rawText":"..."}]}`;

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: userPrompt },
    { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
  ];

  const completion = await withLlmAdmission(() =>
    withLlmTimeout(
      client.chat.completions.create({
        model: config.openaiModel.includes("gpt-4o") ? config.openaiModel : "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content }
        ],
        max_tokens: 1024,
        temperature: 0
      }),
      "passport-vision"
    )
  );

  const raw = completion.choices[0]?.message?.content ?? "";
  try {
    const brazilStays = parseVisionJson(raw);
    return {
      brazilStays,
      extractionSource: "passport_vision",
      notes:
        brazilStays.length > 0
          ? `Extracted ${brazilStays.length} Brazil stay(s) from passport stamps — confirm before saving.`
          : "No Brazil stamps detected in the image."
    };
  } catch {
    return {
      brazilStays: [],
      extractionSource: "passport_vision",
      notes: "Could not parse stamp dates from the image."
    };
  }
}

/** Test helper: parse model JSON without calling OpenAI. */
export function parsePassportVisionResponse(raw: string): ExtractedPassportStay[] {
  return parseVisionJson(raw);
}
