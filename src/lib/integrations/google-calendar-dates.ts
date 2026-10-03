import { addDaysISO, BUSINESS_TIMEZONE, validateRange } from "./homeworks-dates";

/** Midnight in Rhode Island, independent of the Node/Vercel process timezone. */
function easternMidnight(date: string): string {
  // At 00:00 UTC it is still the prior evening in New York. Its offset is
  // also the offset at the requested local midnight (DST switches at 02:00).
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE, timeZoneName: "longOffset",
  }).formatToParts(new Date(date + "T00:00:00Z")).find((part) => part.type === "timeZoneName")!.value.replace("GMT", "");
  return new Date(date + "T00:00:00" + offset).toISOString();
}

export function calendarTimeBounds(range: { from: string; to: string }): { timeMin: string; timeMax: string } {
  const validation = validateRange(range);
  if (!validation.ok) throw new Error(validation.message);
  // Google timeMax is exclusive: midnight AFTER the last requested day.
  return { timeMin: easternMidnight(range.from), timeMax: easternMidnight(addDaysISO(range.to, 1)) };
}
