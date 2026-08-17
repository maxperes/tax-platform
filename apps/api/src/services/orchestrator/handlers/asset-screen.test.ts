import { describe, expect, it } from "vitest";
import { assetScreenPromptText, parseAssetScreenAnswer } from "./asset-screen.js";

describe("assetScreenPromptText", () => {
  it("asks for numbered choices instead of option ids", () => {
    const text = assetScreenPromptText();
    expect(text).toMatch(/1\. Bank accounts/);
    expect(text).toMatch(/10\. Anything else/);
    expect(text).toMatch(/1, 3, 4/);
    expect(text).not.toMatch(/bank_accounts/);
  });
});

describe("parseAssetScreenAnswer", () => {
  it("accepts numbered lists", () => {
    expect(parseAssetScreenAnswer("1")).toEqual(["bank_accounts"]);
    expect(parseAssetScreenAnswer("1, 3, 4")).toEqual([
      "bank_accounts",
      "retirement_accounts",
      "real_estate"
    ]);
    expect(parseAssetScreenAnswer("1 8")).toEqual(["bank_accounts", "crypto_assets"]);
    expect(parseAssetScreenAnswer("none")).toEqual([]);
  });

  it("still accepts labels and option ids", () => {
    expect(parseAssetScreenAnswer("brokerage, real_estate")).toEqual(["brokerage", "real_estate"]);
    expect(parseAssetScreenAnswer("crypto")).toEqual(["crypto_assets"]);
  });
});
