import { BUSINESS_TIMEZONE, isISODate } from "./homeworks-dates";

const eventTime = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const calendarDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
});

/** Timed events use business time; all-day dates retain their original calendar day. */
export function formatCalendarStart(value: string | null | undefined, allDay = false): string {
  if (!value) return "Time unavailable";
  if (allDay) {
    if (!isISODate(value)) return "Date unavailable";
    return calendarDate.format(new Date(value + "T00:00:00Z"));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : eventTime.format(date);
}
