/**
 * Business-local date handling for WeedEater Lawn Care (Rhode Island).
 *
 * Homeworks event dates (startDate/endDate) are calendar dates with no
 * timezone. The bug this fixes: the app derived "today" from
 * `new Date().toISOString()`, i.e. the UTC date. After 8 PM Eastern the UTC
 * date is already tomorrow, so a range that should start "today" started a day
 * late and dropped the current day's jobs. All "today" and range math now
 * goes through America/New_York.
 */
export const BUSINESS_TIMEZONE = "America/New_York";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD for the given instant, as observed in the business timezone. */
export function todayInZone(now: Date = new Date(), timeZone: string = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Calendar-date arithmetic done in UTC on date-only values, so DST can never shift a day. */
export function addDaysISO(date: string, days: number): string {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Invalid date "${date}"`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type DateRange = { from: string; to: string };

export const MAX_RANGE_DAYS = 92;

/** Inclusive range: today through `days` days later, all in the business timezone. */
export function rangeForDays(days: number, now: Date = new Date()): DateRange {
  const from = todayInZone(now);
  return { from, to: addDaysISO(from, days) };
}

/** Every calendar date from `from` to `to`, inclusive, as YYYY-MM-DD strings. */
export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  let d = range.from;
  while (d <= range.to) {
    dates.push(d);
    d = addDaysISO(d, 1);
  }
  return dates;
}

export function validateRange(range: DateRange): { ok: true } | { ok: false; message: string } {
  if (!isISODate(range.from) || !isISODate(range.to)) return { ok: false, message: "Dates must be valid YYYY-MM-DD values." };
  if (range.to < range.from) return { ok: false, message: "The end date is before the start date." };
  const span = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  if (span > MAX_RANGE_DAYS) return { ok: false, message: `Range is longer than ${MAX_RANGE_DAYS} days — narrow it.` };
  return { ok: true };
}
