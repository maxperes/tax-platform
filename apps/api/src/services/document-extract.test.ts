import { describe, expect, it } from "vitest";
import { extractFactsFromDocumentContent } from "./document-extract.js";

describe("document content extraction", () => {
  it("parses a 1099-style brokerage statement", () => {
    const text = `
Broker: Morgan Stanley
Dividend income: $11,492
Capital gains: $32,019
Tax withheld: $2,108
Payment date: 2026-06-15
`;
    const result = extractFactsFromDocumentContent(Buffer.from(text), "morgan-stanley.pdf.txt");
    expect(result?.source).toBe("content");
    expect(result?.suggestions.financialAccountsSummary).toContain("Morgan Stanley");
    const dividends = result?.suggestions.incomes?.find((i) => i.category === "dividends");
    const gains = result?.suggestions.incomes?.find((i) => i.category === "capital_gains");
    expect(dividends?.annualAmount).toBe(11492);
    expect(gains?.annualAmount).toBe(32019);
    expect(dividends?.withholdingTax).toBe(2108);
    expect(dividends?.paymentDate).toBe("2026-06-15");
  });

  it("parses SSA benefit text", () => {
    const result = extractFactsFromDocumentContent(
      Buffer.from("Social Security benefits: $18,400\n"),
      "ssa-1099.txt"
    );
    expect(result?.suggestions.incomes?.[0]?.category).toBe("social_security");
    expect(result?.suggestions.incomes?.[0]?.annualAmount).toBe(18400);
  });

  it("parses CSV brokerage rows", () => {
    const csv = "date,type,amount,tax\n2026-04-01,Dividend,1500,150\n2026-05-01,Interest,80,0\n";
    const result = extractFactsFromDocumentContent(Buffer.from(csv), "brokerage.csv");
    expect(result?.suggestions.incomes?.map((i) => i.category)).toEqual(["dividends", "interest"]);
    expect(result?.suggestions.incomes?.[0]?.annualAmount).toBe(1500);
  });

  it("returns null for binary-like content so filename heuristics remain the fallback", () => {
    const binary = Buffer.from([0, 1, 2, 3, 4, 255, 0, 0, 0]);
    expect(extractFactsFromDocumentContent(binary, "scan.pdf")).toBeNull();
  });
});
