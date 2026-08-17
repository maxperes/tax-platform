import { incomeSourceSchema, type ConversationState } from "@tax-platform/shared";
import {
  defaultOriginCountryForCurrency,
  inferIncomeKindFromChat,
  inferPayerNameFromIncomeChatLine,
  parseMonthlySalaryLines,
  parsePaymentLines
} from "../../income-multi-parse.js";
import { createClassifiedIncome } from "../../persistence/income.js";
import { STATES_ALLOWING_CHAT_INCOME_AMENDMENT } from "../session-context.js";
import { incomeCheckpointMessage } from "../messages.js";
import type { HandlerContext, HandlerResult } from "../session-context.js";

export async function handleChatIncomeAmendment(h: HandlerContext): Promise<HandlerResult> {
  if (!STATES_ALLOWING_CHAT_INCOME_AMENDMENT.has(h.session.state as ConversationState)) {
    return null;
  }

  const parsedLines = parsePaymentLines(h.userContent);
  const monthlyLines =
    parsedLines.length === 0 ? parseMonthlySalaryLines(h.userContent, h.session.taxYear) : [];
  const hints = inferIncomeKindFromChat(
    h.messages.map((m) => ({ role: m.role, content: m.content }))
  );
  const payerName = inferPayerNameFromIncomeChatLine(h.userContent);
  const savedSummaries: string[] = [];

  const saveOne = async (
    line: { grossAmount: number; originalCurrency: string; paymentDate: string },
    periodicity: "monthly" | "annual" | "one_off" | "recurring",
    notesSuffix: string
  ) => {
    const draft = incomeSourceSchema.safeParse({
      payerName,
      originCountry: defaultOriginCountryForCurrency(line.originalCurrency),
      incomeType: hints.incomeType,
      grossAmount: line.grossAmount,
      originalCurrency: line.originalCurrency,
      paymentDate: line.paymentDate,
      periodicity,
      nature: hints.nature,
      notes: notesSuffix
    });
    if (!draft.success) return;
    await createClassifiedIncome(h.session.userId, h.session.taxYear, draft.data);
    const periodNote = periodicity === "monthly" ? " (monthly gross)" : "";
    savedSummaries.push(
      `${draft.data.grossAmount} ${draft.data.originalCurrency} on ${draft.data.paymentDate}${periodNote}`
    );
  };

  if (parsedLines.length >= 1) {
    const notesSuffix =
      parsedLines.length > 1
        ? `Parsed ${parsedLines.length} payment lines from one message; confirm payer and classification if needed.`
        : "Parsed from chat message; confirm payer and classification if needed.";
    for (const line of parsedLines) {
      await saveOne(line, "one_off", notesSuffix);
    }
  } else if (monthlyLines.length >= 1) {
    const notesSuffix =
      "Interpreted as **monthly** gross pay; payment date is an anchor for this tax year—adjust in the income form if needed.";
    for (const line of monthlyLines) {
      await saveOne(line, line.periodicity, notesSuffix);
    }
  }

  if (savedSummaries.length === 0) return null;

  let assistantText =
    `I saved **${savedSummaries.length}** income line(s):\n` +
    savedSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n");
  if ((h.session.state as ConversationState) === "income_capture") {
    assistantText += `\n\n${await incomeCheckpointMessage(h.session.userId, h.session.taxYear)}`;
  } else {
    assistantText +=
      "\n\nPlease confirm employer or payer names if needed, or describe another income type.";
    if ((h.session.state as ConversationState) === "complete") {
      assistantText +=
        "\n\nTo refresh the report, say **regenerate the report**.";
    }
  }
  return { assistantText };
}
