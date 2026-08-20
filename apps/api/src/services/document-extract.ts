/**
 * Narrow extract-and-confirm parsers for 1099 / SSA / brokerage text and CSV.
 * Filename heuristics remain the fallback when nothing structured is found.
 */

export type ExtractedIncomeSuggestion = {
  category: string;
  originCountry: string;
  currency: string;
  annualAmount: number;
  taxPaidOrigin?: number;
  withholdingTax?: number;
  paymentDate?: string;
  brazilianTaxTreatment?: string;
  notes: string;
};

export type StructuredExtraction = {
  source: "content" | "filename_heuristic";
  suggestions: {
    incomes?: ExtractedIncomeSuggestion[];
    financialAccountsSummary?: string[];
    notes?: string;
  };
};

function parseMoney(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseIsoDate(raw: string): string | undefined {
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const us = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!us) return undefined;
  const month = us[1]!.padStart(2, "0");
  const day = us[2]!.padStart(2, "0");
  return `${us[3]}-${month}-${day}`;
}

function decodeText(buffer: Buffer): string | null {
  const utf8 = buffer.toString("utf8");
  const replacement = (utf8.match(/\uFFFD/g) ?? []).length;
  if (utf8.includes("\u0000") || replacement > utf8.length * 0.02) return null;
  let printable = "";
  for (const char of utf8) {
    const code = char.charCodeAt(0);
    // Keep tab (9), LF (10), CR (13); drop other C0 controls.
    if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    printable += char;
  }
  if (printable.trim().length < 8) return null;
  return printable;
}

function parseJsonPayload(text: string): StructuredExtraction | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? [parsed]
        : [];
    const incomes: ExtractedIncomeSuggestion[] = [];
    const accounts: string[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const amount = parseMoney(String(rec.annualAmount ?? rec.amount ?? rec.gross ?? rec.dividends ?? ""));
      const broker = typeof rec.broker === "string" ? rec.broker : typeof rec.institution === "string" ? rec.institution : undefined;
      if (broker) accounts.push(broker);
      if (amount !== undefined && amount > 0) {
        const category =
          typeof rec.category === "string"
            ? rec.category
            : rec.dividends !== undefined
              ? "dividends"
              : rec.capitalGains !== undefined
                ? "capital_gains"
                : "other_income";
        incomes.push({
          category,
          originCountry: typeof rec.originCountry === "string" ? rec.originCountry : "US",
          currency: typeof rec.currency === "string" && rec.currency.length === 3 ? rec.currency : "USD",
          annualAmount: amount,
          taxPaidOrigin: parseMoney(String(rec.taxWithheld ?? rec.taxPaidOrigin ?? "")),
          withholdingTax: parseMoney(String(rec.taxWithheld ?? rec.withholdingTax ?? "")),
          paymentDate: typeof rec.paymentDate === "string" ? parseIsoDate(rec.paymentDate) : undefined,
          notes: "Parsed from uploaded JSON"
        });
      }
    }
    if (incomes.length === 0 && accounts.length === 0) return null;
    return { source: "content", suggestions: { incomes, financialAccountsSummary: accounts } };
  } catch {
    return null;
  }
}

function parseCsv(text: string): StructuredExtraction | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2 || !lines[0]!.includes(",")) return null;
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const amountIdx = header.findIndex((h) => /amount|gross|dividend|proceeds|income/.test(h));
  if (amountIdx < 0) return null;
  const dateIdx = header.findIndex((h) => /date|paid|credit/.test(h));
  const withheldIdx = header.findIndex((h) => /withhold|tax/.test(h));
  const descIdx = header.findIndex((h) => /desc|type|category|symbol/.test(h));
  const brokerIdx = header.findIndex((h) => /broker|institution|payer/.test(h));
  const incomes: ExtractedIncomeSuggestion[] = [];
  const accounts: string[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const amount = parseMoney(cols[amountIdx] ?? "");
    if (amount === undefined || amount <= 0) continue;
    const desc = (descIdx >= 0 ? cols[descIdx] : "") ?? "";
    const category = /div/i.test(desc)
      ? "dividends"
      : /gain|proceed/i.test(desc)
        ? "capital_gains"
        : /interest/i.test(desc)
          ? "interest"
          : "other_income";
    const broker = brokerIdx >= 0 ? cols[brokerIdx] : undefined;
    if (broker) accounts.push(broker);
    incomes.push({
      category,
      originCountry: "US",
      currency: "USD",
      annualAmount: amount,
      withholdingTax: withheldIdx >= 0 ? parseMoney(cols[withheldIdx] ?? "") : undefined,
      paymentDate: dateIdx >= 0 ? parseIsoDate(cols[dateIdx] ?? "") : undefined,
      notes: "Parsed from uploaded CSV"
    });
  }
  if (incomes.length === 0) return null;
  return { source: "content", suggestions: { incomes, financialAccountsSummary: [...new Set(accounts)] } };
}

function matchLabeledAmount(text: string, labels: RegExp): number | undefined {
  const m = text.match(labels);
  if (!m) return undefined;
  return parseMoney(m[1] ?? "");
}

function parseTaxFormText(text: string, fileName: string): StructuredExtraction | null {
  const incomes: ExtractedIncomeSuggestion[] = [];
  const accounts: string[] = [];
  const lower = text.toLowerCase();

  const broker =
    text.match(/broker[:\s]+([A-Za-z][A-Za-z0-9 .&-]{2,40})/i)?.[1]?.trim() ??
    text.match(/(Morgan Stanley|Schwab|Fidelity|Vanguard|E\*Trade|Interactive Brokers)/i)?.[1];
  if (broker) accounts.push(broker);

  const dividend = matchLabeledAmount(
    text,
    /(?:ordinary\s+dividends|dividend income|dividends)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const interest = matchLabeledAmount(
    text,
    /(?:interest income|box 1 interest)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const gains = matchLabeledAmount(
    text,
    /(?:capital gains?|total proceeds)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const withheld = matchLabeledAmount(
    text,
    /(?:federal income tax withheld|tax withheld)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const ssa = matchLabeledAmount(
    text,
    /(?:net benefits|social security benefits)[:\s]*\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  const paymentDate =
    parseIsoDate(text.match(/payment date[:\s]+([0-9/-]+)/i)?.[1] ?? "") ??
    parseIsoDate(text.match(/credit date[:\s]+([0-9/-]+)/i)?.[1] ?? "");

  if (dividend) {
    incomes.push({
      category: "dividends",
      originCountry: "US",
      currency: "USD",
      annualAmount: dividend,
      withholdingTax: withheld,
      paymentDate,
      brazilianTaxTreatment: "salary_progressive",
      notes: `Parsed dividend income from ${fileName}`
    });
  }
  if (interest) {
    incomes.push({
      category: "interest",
      originCountry: "US",
      currency: "USD",
      annualAmount: interest,
      paymentDate,
      notes: `Parsed interest income from ${fileName}`
    });
  }
  if (gains) {
    incomes.push({
      category: "capital_gains",
      originCountry: "US",
      currency: "USD",
      annualAmount: gains,
      withholdingTax: withheld && !dividend ? withheld : undefined,
      paymentDate,
      brazilianTaxTreatment: "capital_gain",
      notes: `Parsed capital gains from ${fileName}`
    });
  }
  if (ssa) {
    incomes.push({
      category: "social_security",
      originCountry: "US",
      currency: "USD",
      annualAmount: ssa,
      paymentDate,
      brazilianTaxTreatment: "salary_progressive",
      notes: `Parsed Social Security benefits from ${fileName}`
    });
  }

  const looksLikeForm =
    /1099|ssa-|social security|brokerage|form 1040/i.test(lower) || incomes.length > 0;
  if (!looksLikeForm || (incomes.length === 0 && accounts.length === 0)) return null;
  return {
    source: "content",
    suggestions: {
      incomes,
      financialAccountsSummary: accounts,
      notes: incomes.length === 0 ? "Identified a statement; confirm amounts manually." : undefined
    }
  };
}

/** Try structured parse of an uploaded blob. Returns null when content is not text or has no facts. */
export function extractFactsFromDocumentContent(
  buffer: Buffer,
  fileName: string
): StructuredExtraction | null {
  const text = decodeText(buffer);
  if (!text) return null;
  return parseJsonPayload(text) ?? parseCsv(text) ?? parseTaxFormText(text, fileName);
}
