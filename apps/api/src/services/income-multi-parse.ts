/**
 * Parse "amount [k|m] CURRENCY [on|in|…] YYYY-MM-DD" tokens from free text (comma or space separated).
 * Supports shorthand amounts (e.g. 15k → 15_000) and a short filler word before the date.
 */

export type ParsedPaymentLine = {
  grossAmount: number;
  originalCurrency: string;
  paymentDate: string;
};

export function parsePaymentLines(text: string): ParsedPaymentLine[] {
  // Amount + ISO4217-ish 3-letter currency, then optional filler (e.g. "payment date") before YYYY-MM-DD.
  const re =
    /(\d+(?:[.,]\d+)?)\s*([kKmM])?\s+([A-Za-z]{3})\b[\s,.]*(?:payment\s+date|paid|on|in|at|for|dated?)?[\s,.]*(\d{4}-\d{2}-\d{2})/gi;
  const out: ParsedPaymentLine[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawAmt = m[1]!.replace(",", ".");
    let amt = Number(rawAmt);
    if (Number.isNaN(amt) || amt < 0) continue;
    const suffix = (m[2] ?? "").toUpperCase();
    if (suffix === "K") amt *= 1000;
    if (suffix === "M") amt *= 1_000_000;
    const cur = m[3]!.toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) continue;
    const date = m[4]!;
    out.push({ grossAmount: amt, originalCurrency: cur, paymentDate: date });
  }
  return out;
}

export type ParsedChatIncomeLine = ParsedPaymentLine & {
  periodicity: "monthly" | "annual" | "one_off";
};

/**
 * Gross amount per month when the user gives no payment date (e.g. "10900 USD per month").
 * Uses taxYear-01-31 as an anchor pay date when none appears in the text.
 */
export function parseMonthlySalaryLines(text: string, taxYear: number): ParsedChatIncomeLine[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (
    !/\b(?:per\s+month|\/\s*month|each\s+month|every\s+month|a\s+month|monthly\s+basis|paid\s+monthly|monthly)\b/i.test(
      normalized
    )
  ) {
    return [];
  }
  const m = /(\d+(?:[.,]\d+)?)\s*([kKmM])?\s+([A-Za-z]{3})\b/i.exec(normalized);
  if (!m) return [];
  const rawAmt = m[1]!.replace(",", ".");
  let amt = Number(rawAmt);
  if (Number.isNaN(amt) || amt < 0) return [];
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "K") amt *= 1000;
  if (suffix === "M") amt *= 1_000_000;
  const cur = m[3]!.toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return [];
  const dm = /(\d{4}-\d{2}-\d{2})/.exec(normalized);
  const paymentDate = dm?.[1] ?? `${taxYear}-01-31`;
  return [{ grossAmount: amt, originalCurrency: cur, paymentDate, periodicity: "monthly" }];
}

export type IncomeKindHint = {
  incomeType: string;
  nature: "work" | "investment" | "retirement" | "asset" | "corporate" | "trust" | "other";
};

export function inferIncomeKindFromChat(history: { role: string; content: string }[]): IncomeKindHint {
  const blob = history
    .slice(-14)
    .map((h) => h.content)
    .join(" ")
    .toLowerCase();
  if (/\bdividend(s)?\b/.test(blob)) return { incomeType: "dividend", nature: "investment" };
  if (/\brent(al)?\b/.test(blob)) return { incomeType: "rent", nature: "investment" };
  if (/\binterest\b/.test(blob)) return { incomeType: "interest", nature: "investment" };
  if (/\b(self[-\s]?employment|freelance|contractor|1099)\b/.test(blob))
    return { incomeType: "self_employment", nature: "work" };
  if (
    /\b(salary|wages?|payroll|per\s+month|\/\s*month|each\s+month|every\s+month|monthly)\b/.test(blob)
  )
    return { incomeType: "salary", nature: "work" };
  return { incomeType: "income", nature: "other" };
}

/** Short payer hint from phrases like "salary from Acme Inc". */
export function inferPayerNameFromIncomeChatLine(text: string): string {
  const t = text.trim();
  const from = /\bfrom\s+([^,]+?)(?=\s*,|\s+paid|\s+per\s+month|\s+monthly|\s+\d)/i.exec(t);
  if (from) {
    const name = from[1]!.trim();
    if (name.length >= 2 && name.length < 120) return `${name} (please confirm)`;
  }
  return "Employer (please confirm)";
}

/** Heuristic payer country from payment currency (not legal advice; user should confirm). */
export function defaultOriginCountryForCurrency(currency: string): string {
  switch (currency.toUpperCase()) {
    case "BRL":
      return "BR";
    case "USD":
      return "US";
    case "EUR":
      return "DE";
    case "GBP":
      return "GB";
    default:
      return "US";
  }
}
