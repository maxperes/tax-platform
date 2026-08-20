import type { BrazilStay } from "./twin.js";
import { NOT_SURE, type InterviewAnswers, type InterviewRecord } from "./interview-record.js";

/** Maximum separate Brazil stays recorded in the interview. */
export const MAX_BRAZIL_STAYS = 12;

const MS_DAY = 86_400_000;

function asString(answers: InterviewAnswers, id: string): string | undefined {
  const value = answers[id];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoDate(value?: string): string | undefined {
  if (!value || value === NOT_SURE) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** Infer trip count from existing brazil_trip_N_entry keys (supports legacy brazil_trip_count). */
export function inferBrazilTripCount(answers: InterviewAnswers): number {
  const explicit = Number(asString(answers, "brazil_trip_count"));
  if (Number.isInteger(explicit) && explicit >= 1) {
    return Math.min(explicit, MAX_BRAZIL_STAYS);
  }
  let max = 0;
  for (let index = 1; index <= MAX_BRAZIL_STAYS; index += 1) {
    if (asString(answers, `brazil_trip_${index}_entry`)) max = index;
  }
  return max;
}

/** Collect Brazil stays from flat interview answer keys. */
export function collectBrazilStaysFromInterview(
  record: Pick<InterviewRecord, "answers">
): BrazilStay[] | undefined {
  const currentlyInBrazil = asString(record.answers, "currently_in_brazil") === "yes";
  const count = inferBrazilTripCount(record.answers);
  const stays: BrazilStay[] = [];

  if (count >= 1) {
    for (let index = 1; index <= count; index += 1) {
      const entry = isoDate(asString(record.answers, `brazil_trip_${index}_entry`));
      if (!entry) continue;
      const exit = isoDate(asString(record.answers, `brazil_trip_${index}_exit`));
      const isLast = index === count;
      if (exit) {
        stays.push({ entryDate: entry, exitDate: exit });
      } else if (isLast && currentlyInBrazil) {
        stays.push({ entryDate: entry });
      }
    }
  }

  if (stays.length === 0) {
    const legacyEntry = isoDate(asString(record.answers, "first_entry_date"));
    if (legacyEntry && currentlyInBrazil) {
      stays.push({ entryDate: legacyEntry });
    }
  }

  stays.sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  return stays.length > 0 ? stays : undefined;
}

/** Write stays back to flat brazil_trip_N_* interview keys. */
export function syncBrazilStaysToInterviewAnswers(
  stays: BrazilStay[],
  _currentlyInBrazil: boolean
): InterviewAnswers {
  const answers: InterviewAnswers = {};
  const capped = stays.slice(0, MAX_BRAZIL_STAYS);

  for (let index = 0; index < capped.length; index += 1) {
    const stay = capped[index]!;
    const n = index + 1;
    answers[`brazil_trip_${n}_entry`] = stay.entryDate;
    // Always write exit explicitly so clearing a previously set date is not lost on merge.
    answers[`brazil_trip_${n}_exit`] = stay.exitDate || undefined;
  }

  for (let index = capped.length + 1; index <= MAX_BRAZIL_STAYS; index += 1) {
    answers[`brazil_trip_${index}_entry`] = undefined;
    answers[`brazil_trip_${index}_exit`] = undefined;
  }

  if (capped.length > 0) {
    answers.brazil_trip_count = String(capped.length);
  } else {
    answers.brazil_trip_count = undefined;
  }

  return answers;
}

function toUtcNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00.000Z`);
}

function fromUtcNoon(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function enumerateStayDays(stay: BrazilStay, asOfDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.entryDate)) return [];
  const start = stay.entryDate > asOfDate ? null : stay.entryDate;
  if (!start) return [];
  let end = stay.exitDate && /^\d{4}-\d{2}-\d{2}$/.test(stay.exitDate) ? stay.exitDate : asOfDate;
  if (end > asOfDate) end = asOfDate;
  if (end < start) return [];
  const days: string[] = [];
  for (let t = toUtcNoon(start); t <= toUtcNoon(end); t += MS_DAY) {
    days.push(fromUtcNoon(t));
  }
  return days;
}

/** Count unique presence days through asOfDate (defaults to today UTC). */
export function countPresenceDaysFromStays(stays: BrazilStay[], asOfDate?: string): number {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  const unique = new Set<string>();
  for (const stay of stays) {
    for (const day of enumerateStayDays(stay, asOf)) unique.add(day);
  }
  return unique.size;
}
