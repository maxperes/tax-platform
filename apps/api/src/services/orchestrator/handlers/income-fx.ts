import { prisma } from "../../../db.js";
import { parseFxConversionReply, normalizeCurrencyCode } from "../../income-multi-parse.js";
import { resolveIncomeGaps } from "../../intake-helpers.js";
import { incomeCheckpointMessage } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleIncomeFx(h: HandlerContext): Promise<HandlerResult> {
  const parsed = parseFxConversionReply(h.userContent);
  if (!parsed) return null;

  const rows = await prisma.incomeSource.findMany({
    where: { userId: h.session.userId, taxYear: h.session.taxYear },
    orderBy: { createdAt: "desc" }
  });
  if (rows.length === 0) return null;

  const targets =
    parsed.kind === "rate"
      ? rows.filter(
          (r) => normalizeCurrencyCode(r.originalCurrency) === parsed.foreignCurrency
        )
      : rows.filter((r) => normalizeCurrencyCode(r.originalCurrency) !== "BRL");
  const toUpdate = targets.length > 0 ? targets : rows.filter((r) => normalizeCurrencyCode(r.originalCurrency) !== "BRL");
  if (toUpdate.length === 0) return null;

  for (const row of toUpdate) {
    await prisma.incomeSource.update({
      where: { id: row.id },
      data:
        parsed.kind === "rate"
          ? { exchangeRateToBrl: parsed.rateToBrl }
          : { grossAmountBrl: parsed.amountBrl }
    });
  }

  const gaps = await resolveIncomeGaps(h.session.userId, h.session.taxYear);
  const saved =
    parsed.kind === "rate"
      ? `Saved **${parsed.rateToBrl} BRL per ${parsed.foreignCurrency}** on ${toUpdate.length} income line(s).`
      : `Saved **${parsed.amountBrl} BRL** as the converted gross on ${toUpdate.length} income line(s).`;

  if (h.session.state === "income_capture") {
    return {
      assistantText: `${saved}\n\n${gaps.summaryText ? `${gaps.summaryText}\n\n` : ""}${await incomeCheckpointMessage(h.session.userId, h.session.taxYear)}`
    };
  }

  const next = gaps.hasBlockingGaps
    ? `${gaps.summaryText}\n\nSend another rate, or say **proceed anyway** for a preliminary report.`
    : "Say **regenerate the report** to refresh the estimates with this conversion.";
  return { assistantText: `${saved}\n\n${next}` };
}
