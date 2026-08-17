import type { Prisma } from "../../../prisma-client.js";
import { prisma } from "../../../db.js";
import { eventsCheckpointMessage } from "../../intake-helpers.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export const ASSET_SCREEN_PENDING_KEY = "_assetScreenPending";

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
  await prisma.conversationSession.update({
    where: { id: h.sessionId },
    data: {
      state: "events",
      contextJson: newCtx as Prisma.InputJsonValue
    }
  });

  const mapHint =
    types.length > 0
      ? `Recorded **${types.length}** asset categor${types.length === 1 ? "y" : "ies"}. `
      : "No asset categories recorded. ";
  return {
    assistantText:
      `${mapHint}\n\n` +
      (await eventsCheckpointMessage(h.session.userId, h.session.taxYear))
  };
}
