/**
 * BR-RESID-001 — Brazilian tax residency start from presence and entry pathway.
 *
 * 183-day test: more than 183 days, consecutive or not, in any period of up to
 * 12 months. Residency starts on the 184th day of presence in that window
 * (RIR/2018 residence rules / Lei 9.718/1998). Day-level stays are required
 * for the rolling window; a calendar-year band is a review fallback only.
 */

import type { BrazilEntryPathway, BrazilStay, TwinResidencyFacts } from "@tax-platform/shared";

export const BR_RESID_001_META = {
  id: "BR-RESID-001",
  versao: "1.0.0",
  tributo: "IRPF",
  especie: "regra_de_incidencia",
  grauCertezaIncidencia: "pacifico" as const,
  dependeDe: [] as string[],
  ePressupostoDe: ["BR-IRPF-EXT-001"],
  fontes: [
    { peso: 1, citation: "Lei 9.718/1998" },
    { peso: 2, citation: "RIR/2018 (Dec. 9.580/2018) — caracterização de residente" }
  ]
} as const;

export type Resid001Method =
  | "permanent_visa"
  | "183_days"
  | "returning_brazilian"
  | "already_resident"
  | "undetermined";

export type Resid001Result = {
  regraId: "BR-RESID-001";
  brazilianTaxResidencyStartDate: string | null;
  method: Resid001Method;
  anticipatable: boolean;
  presenceDaysCounted: number;
  rollingWindowApplied: boolean;
  notes: string[];
  requiresReview: boolean;
};

const MS_DAY = 86_400_000;

function toUtcNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00.000Z`);
}

function fromUtcNoon(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
  return fromUtcNoon(toUtcNoon(iso) + days * MS_DAY);
}

function addUtcMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/** Presence days in (endDate − 12 calendar months, endDate], exclusive of the 12-month-prior date. */
export function rollingWindowStartExclusive(endDate: string): string {
  return addUtcMonths(endDate, -12);
}

export function enumerateStayDays(stay: BrazilStay, asOfDate: string): string[] {
  if (!isIsoDate(stay.entryDate)) return [];
  const start = stay.entryDate > asOfDate ? null : stay.entryDate;
  if (!start) return [];
  let end = stay.exitDate && isIsoDate(stay.exitDate) ? stay.exitDate : asOfDate;
  if (end > asOfDate) end = asOfDate;
  if (end < start) return [];
  const days: string[] = [];
  for (let t = toUtcNoon(start); t <= toUtcNoon(end); t += MS_DAY) {
    days.push(fromUtcNoon(t));
  }
  return days;
}

export function presenceDaysFromStays(stays: BrazilStay[], asOfDate: string): string[] {
  const unique = new Set<string>();
  for (const stay of stays) {
    for (const day of enumerateStayDays(stay, asOfDate)) unique.add(day);
  }
  return Array.from(unique).sort();
}

/**
 * First presence day on which count of presence days in the prior 12 months exceeds 183.
 * That day is the 184th day of presence in the window — residency start under BR-RESID-001.
 */
export function firstDayExceeding183(presenceDaysSorted: string[]): string | null {
  let left = 0;
  for (let right = 0; right < presenceDaysSorted.length; right++) {
    const end = presenceDaysSorted[right]!;
    const windowStart = rollingWindowStartExclusive(end);
    while (left <= right && presenceDaysSorted[left]! <= windowStart) left += 1;
    const count = right - left + 1;
    if (count > 183) return end;
  }
  return null;
}

function earliestEntry(facts: TwinResidencyFacts): string | undefined {
  const fromStays = (facts.brazilStays ?? [])
    .map((stay) => stay.entryDate)
    .filter(isIsoDate)
    .sort();
  const candidates = [facts.firstEntryBrazilDate, fromStays[0]].filter(isIsoDate).sort();
  return candidates[0];
}

export function evaluateBrResid001(facts: TwinResidencyFacts, asOfDate: string): Resid001Result {
  const notes: string[] = [];
  const pathway: BrazilEntryPathway = facts.entryPathway ?? "unknown";

  if (facts.currentlyFiscalResidentBrazil) {
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: earliestEntry(facts) ?? asOfDate,
      method: "already_resident",
      anticipatable: false,
      presenceDaysCounted: 0,
      rollingWindowApplied: false,
      notes: ["Client indicates they are already a Brazilian tax resident."],
      requiresReview: true
    };
  }

  if (pathway === "permanent_visa" || pathway === "marriage" || pathway === "family_reunification") {
    const start = earliestEntry(facts) ?? null;
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: start,
      method: "permanent_visa",
      anticipatable: Boolean(start),
      presenceDaysCounted: 0,
      rollingWindowApplied: false,
      notes: [
        "Permanent / family pathway: residency typically starts on visa/RNM grant or entry — confirm exact administrative date."
      ],
      requiresReview: !start
    };
  }

  if (pathway === "returning_brazilian" || pathway === "expatriate_brazilian") {
    const start = earliestEntry(facts) ?? null;
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: start,
      method: "returning_brazilian",
      anticipatable: Boolean(start),
      presenceDaysCounted: 0,
      rollingWindowApplied: false,
      notes: ["Returning Brazilian pathway — confirm IN characterization and prior exit."],
      requiresReview: true
    };
  }

  const stays = (facts.brazilStays ?? []).filter((stay) => isIsoDate(stay.entryDate));
  const presence = presenceDaysFromStays(stays, asOfDate);
  const rollingStart = firstDayExceeding183(presence);

  if (rollingStart) {
    notes.push(
      `BR-RESID-001: more than 183 days of presence in a 12-month window; residency starts on ${rollingStart} (184th day).`
    );
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: rollingStart,
      method: "183_days",
      anticipatable: true,
      presenceDaysCounted: presence.length,
      rollingWindowApplied: true,
      notes,
      requiresReview: true
    };
  }

  const daysBand = facts.daysInBrazilCalendarYear;
  const bandEntry = facts.firstEntryBrazilDate;
  if (presence.length === 0 && daysBand !== undefined && daysBand > 183 && isIsoDate(bandEntry)) {
    const approx = addUtcDays(bandEntry, 183);
    notes.push(
      "No day-level stay history. Approximate start is first entry plus 183 days from a calendar-year day band — not the statutory rolling 12-month test."
    );
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: approx,
      method: "183_days",
      anticipatable: true,
      presenceDaysCounted: 0,
      rollingWindowApplied: false,
      notes,
      requiresReview: true
    };
  }

  if (presence.length > 0) {
    notes.push(
      `Presence history counts ${presence.length} day(s) through ${asOfDate}, with no 12-month window above 183 days.`
    );
  }

  if (pathway === "temporary_visa" || pathway === "digital_nomad") {
    notes.push("Temporary / digital nomad pathway — monitor 183-day presence; residency may not start on day one.");
    return {
      regraId: "BR-RESID-001",
      brazilianTaxResidencyStartDate: null,
      method: "undetermined",
      anticipatable: true,
      presenceDaysCounted: presence.length,
      rollingWindowApplied: presence.length > 0,
      notes,
      requiresReview: true
    };
  }

  notes.push("Insufficient facts to determine Brazilian tax residency start date.");
  return {
    regraId: "BR-RESID-001",
    brazilianTaxResidencyStartDate: null,
    method: "undetermined",
    anticipatable: false,
    presenceDaysCounted: presence.length,
    rollingWindowApplied: presence.length > 0,
    notes,
    requiresReview: true
  };
}

export function isResidentOn(result: Resid001Result, date: string): boolean {
  if (!result.brazilianTaxResidencyStartDate) return false;
  return date >= result.brazilianTaxResidencyStartDate;
}
