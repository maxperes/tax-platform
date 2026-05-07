import { describe, expect, it } from "vitest";
import { jurisdictionsForProfile } from "@tax-platform/rules";
import type { FiscalProfile } from "@tax-platform/shared";

/**
 * Smoke: jurisdiction routing for annual estimates (no HTTP / DB).
 * Full route tests would need Prisma + auth; see README tax engine section.
 */
describe("tax jurisdiction routing", () => {
  it("resident_brazil maps to BR only", () => {
    expect(jurisdictionsForProfile("resident_brazil" as FiscalProfile)).toEqual(["BR"]);
  });

  it("resident_usa maps to US only", () => {
    expect(jurisdictionsForProfile("resident_usa" as FiscalProfile)).toEqual(["US"]);
  });

  it("dual_residence maps to BR and US", () => {
    expect(jurisdictionsForProfile("dual_residence" as FiscalProfile)).toEqual(["BR", "US"]);
  });
});
