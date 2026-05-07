import { describe, expect, it } from "vitest";
import {
  defaultOriginCountryForCurrency,
  inferIncomeKindFromChat,
  inferPayerNameFromIncomeChatLine,
  parseMonthlySalaryLines,
  parsePaymentLines
} from "./income-multi-parse.js";

describe("parsePaymentLines", () => {
  it("extracts multiple amount currency date tokens", () => {
    const text =
      "here are two: 8000 USD 2026-01-15 and 1500.50 BRL 2026-02-01, thanks";
    expect(parsePaymentLines(text)).toEqual([
      { grossAmount: 8000, originalCurrency: "USD", paymentDate: "2026-01-15" },
      { grossAmount: 1500.5, originalCurrency: "BRL", paymentDate: "2026-02-01" }
    ]);
  });

  it("accepts comma as decimal separator", () => {
    expect(parsePaymentLines("99,5 EUR 2025-12-31")).toEqual([
      { grossAmount: 99.5, originalCurrency: "EUR", paymentDate: "2025-12-31" }
    ]);
  });

  it("parses k shorthand and optional filler before date", () => {
    expect(parsePaymentLines("add a new income of 15k USD in 2026-01-25")).toEqual([
      { grossAmount: 15000, originalCurrency: "USD", paymentDate: "2026-01-25" }
    ]);
    expect(parsePaymentLines("5000 USD on 2026-02-01")).toEqual([
      { grossAmount: 5000, originalCurrency: "USD", paymentDate: "2026-02-01" }
    ]);
  });

  it("parses a single payment line", () => {
    expect(parsePaymentLines("only one: 1200 BRL 2026-03-10 thanks")).toEqual([
      { grossAmount: 1200, originalCurrency: "BRL", paymentDate: "2026-03-10" }
    ]);
  });

  it("parses amount and currency when payment date is spelled out", () => {
    expect(
      parsePaymentLines(
        "Salary from US employer, paid monthly, 10900 USD, payment date 2026-01-31."
      )
    ).toEqual([{ grossAmount: 10900, originalCurrency: "USD", paymentDate: "2026-01-31" }]);
  });
});

describe("parseMonthlySalaryLines", () => {
  it("parses monthly gross without an explicit date (anchors to tax year January)", () => {
    expect(parseMonthlySalaryLines("10900 usd per month", 2026)).toEqual([
      {
        grossAmount: 10900,
        originalCurrency: "USD",
        paymentDate: "2026-01-31",
        periodicity: "monthly"
      }
    ]);
  });

  it("uses an explicit date when present", () => {
    expect(parseMonthlySalaryLines("9500 BRL monthly, paid 2026-06-30", 2026)).toEqual([
      {
        grossAmount: 9500,
        originalCurrency: "BRL",
        paymentDate: "2026-06-30",
        periodicity: "monthly"
      }
    ]);
  });
});

describe("inferPayerNameFromIncomeChatLine", () => {
  it("extracts text after from", () => {
    expect(inferPayerNameFromIncomeChatLine("Salary from US employer, paid monthly")).toBe(
      "US employer (please confirm)"
    );
  });
});

describe("inferIncomeKindFromChat", () => {
  it("detects dividend from recent messages", () => {
    const h = inferIncomeKindFromChat([
      { role: "user", content: "I have dividend income" },
      { role: "assistant", content: "OK" }
    ]);
    expect(h).toEqual({ incomeType: "dividend", nature: "investment" });
  });
});

describe("defaultOriginCountryForCurrency", () => {
  it("maps common currencies", () => {
    expect(defaultOriginCountryForCurrency("brl")).toBe("BR");
    expect(defaultOriginCountryForCurrency("USD")).toBe("US");
  });
});
