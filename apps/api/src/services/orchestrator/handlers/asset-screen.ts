import type { Prisma } from "../../../prisma-client.js";
import { prisma } from "../../../db.js";
import { eventsCheckpointMessage } from "../../intake-helpers.js";
import { normalizeCountryCode } from "../../fiscal-intake.js";
import { isoToInterviewCountry } from "@tax-platform/shared";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export const ASSET_SCREEN_PENDING_KEY = "_assetScreenPending";
export const ASSET_COUNTRY_QUEUE_KEY = "_assetCountryQueue";

function assetLabel(id: string): string {
  return ASSET_SCREEN_OPTIONS.find((o) => o.id === id)?.label ?? id.replace(/_/g, " ");
}

export function assetCountryPrompt(typeId: string): string {
  return (
    `Which country are your **${assetLabel(typeId)}** in?\n\n` +
    "Reply with a country name or ISO code (e.g. **United States** or **US**), or **not sure**."
  );
}

function parseAssetCountryAnswer(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (/^(not[_\s-]?sure|unsure|unknown|idk|n\/a|skip)$/i.test(t)) return "other";
  const iso = normalizeCountryCode(t);
  if (!iso || iso.length < 2) return undefined;
  return isoToInterviewCountry(iso);
}

export function isAssetCountryPending(context: Record<string, unknown>): boolean {
  return Array.isArray(context[ASSET_COUNTRY_QUEUE_KEY]) && (context[ASSET_COUNTRY_QUEUE_KEY] as unknown[]).length > 0;
}

const ASSET_SCREEN_OPTIONS: { id: string; label: string }[] = [
  { id: "bank_accounts", label: "Bank accounts" },
  { id: "brokerage", label: "Brokerage or investment accounts" },
  { id: "retirement_accounts", label: "Retirement accounts (401(k), IRA, pension)" },
  { id: "real_estate", label: "Real estate" },
  { id: "foreign_companies", label: "Companies outside Brazil" },
  { id: "brazilian_companies", label: "Companies in Brazil" },
  { id: "trust_interests", label: "Trusts" },
  { id: "crypto_assets", label: "Cryptocurrency" },
  { id: "loans_receivable", label: "Loans you are owed" },
  { id: "other_assets", label: "Anything else" }
];

const ASSET_TOKENS: Record<string, string> = {
  bank: "bank_accounts",
  banks: "bank_accounts",
  bank_accounts: "bank_accounts",
  brokerage: "brokerage",
  investments: "brokerage",
  retirement: "retirement_accounts",
  retirement_accounts: "retirement_accounts",
  "401k": "retirement_accounts",
  ira: "retirement_accounts",
  real_estate: "real_estate",
  property: "real_estate",
  house: "real_estate",
  foreign_companies: "foreign_companies",
  company: "foreign_companies",
  brazilian_companies: "brazilian_companies",
  trust: "trust_interests",
  trusts: "trust_interests",
  trust_interests: "trust_interests",
  crypto: "crypto_assets",
  crypto_assets: "crypto_assets",
  loan: "loans_receivable",
  loans_receivable: "loans_receivable",
  other: "other_assets",
  other_assets: "other_assets"
};

export function assetScreenPromptText(): string {
  return (
    "Which **asset categories** do you hold, in Brazil or abroad?\n\n" +
    ASSET_SCREEN_OPTIONS.map((o, i) => `${i + 1}. ${o.label}`).join("\n") +
    "\n\nReply with the numbers that apply (e.g. **1, 3, 4**), or **none**."
  );
}

export function isAssetScreenPending(context: Record<string, unknown>): boolean {
  return context[ASSET_SCREEN_PENDING_KEY] === true;
}

export function parseAssetScreenAnswer(text: string): string[] | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  if (/^(none|no|n\/a|skip|nothing)$/i.test(t)) return [];

  const looseParts = t.split(/[\s,;/&]+/).filter(Boolean);
  const allNumbers =
    looseParts.length > 0 &&
    looseParts.every((p) => /^(?:option\s+)?(?:10|[1-9])[.)]?$/.test(p));
  const parts = allNumbers
    ? looseParts
    : t
        .split(/[,;/]| and /)
        .map((p) => p.trim())
        .filter(Boolean);

  const mapped: string[] = [];
  for (const part of parts) {
    const num = /^(?:option\s+)?(10|[1-9])[.)]?$/.exec(part);
    if (num) {
      const opt = ASSET_SCREEN_OPTIONS[Number(num[1]) - 1];
      if (opt) mapped.push(opt.id);
      continue;
    }
    const token = part.replace(/[\s-]+/g, "_");
    if (ASSET_TOKENS[token]) {
      mapped.push(ASSET_TOKENS[token]);
      continue;
    }
    const hit = Object.entries(ASSET_TOKENS).find(([key]) => token.includes(key) || part.includes(key));
    if (hit) mapped.push(hit[1]);
  }
  if (mapped.length === 0 && !/^(none|no)$/i.test(t)) return undefined;
  return Array.from(new Set(mapped));
}

export async function handleAssetScreen(h: HandlerContext): Promise<HandlerResult> {
  if (!isAssetScreenPending(h.ctx)) return null;
  const types = parseAssetScreenAnswer(h.userContent);
  if (types === undefined) {
    return { assistantText: `Please pick from the list, or say **none**.\n\n${assetScreenPromptText()}` };
  }

  const newCtx: Record<string, unknown> = { ...h.ctx, assetTypes: types };
  delete newCtx[ASSET_SCREEN_PENDING_KEY];
  if (types.length > 0) {
    newCtx[ASSET_COUNTRY_QUEUE_KEY] = [...types];
    newCtx.assetCountries = {
      ...((h.ctx.assetCountries as Record<string, string> | undefined) ?? {})
    };
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { contextJson: newCtx as Prisma.InputJsonValue }
    });
    const mapHint = `Recorded **${types.length}** asset categor${types.length === 1 ? "y" : "ies"}.`;
    return {
      assistantText: `${mapHint}\n\n${assetCountryPrompt(types[0]!)}`
    };
  }
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: {
      state: "events",
      contextJson: newCtx as Prisma.InputJsonValue
    }
  });

  return {
    assistantText:
      `No asset categories recorded.\n\n` +
      (await eventsCheckpointMessage(h.session.userId, h.session.taxYear))
  };
}

export async function handleAssetCountry(h: HandlerContext): Promise<HandlerResult> {
  if (!isAssetCountryPending(h.ctx)) return null;
  const queue = [...(h.ctx[ASSET_COUNTRY_QUEUE_KEY] as string[])];
  const current = queue[0];
  if (!current) return null;
  const country = parseAssetCountryAnswer(h.userContent);
  if (!country) {
    return { assistantText: `Please name a country, or say **not sure**.\n\n${assetCountryPrompt(current)}` };
  }

  const remaining = queue.slice(1);
  const countries = {
    ...((h.ctx.assetCountries as Record<string, string> | undefined) ?? {}),
    [current]: country
  };
  const newCtx: Record<string, unknown> = { ...h.ctx, assetCountries: countries };
  if (remaining.length > 0) {
    newCtx[ASSET_COUNTRY_QUEUE_KEY] = remaining;
    await prisma.conversationSession.update({
      where: { id: h.sessionId },
      data: { contextJson: newCtx as Prisma.InputJsonValue }
    });
    return { assistantText: assetCountryPrompt(remaining[0]!) };
  }

  delete newCtx[ASSET_COUNTRY_QUEUE_KEY];
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: {
      state: "events",
      contextJson: newCtx as Prisma.InputJsonValue
    }
  });
  return {
    assistantText: await eventsCheckpointMessage(h.session.userId, h.session.taxYear)
  };
}
