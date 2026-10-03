import { calendarTimeBounds } from "@/lib/integrations/google-calendar-dates";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-connection";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; reason?: "not_connected" | "error" };

async function callApi<T>(path: string, searchParams?: Record<string, string>): Promise<ApiResult<T>> {
  const token = await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message, reason: token.reason === "not_connected" ? "not_connected" : "error" };

  const url = new URL(`${CALENDAR_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(searchParams ?? {})) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), { headers: { authorization: `Bearer ${token.accessToken}` } });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach Google Calendar.", reason: "error" };
  }
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `Google Calendar API returned ${response.status}: ${text.slice(0, 300)}`, reason: "error" };
  }
  return { ok: true, data: (await response.json()) as T };
}

export type GoogleCalendarListEntry = { id: string; summary: string; primary?: boolean };

/** Read-only. Powers the calendar-selection step after connecting. */
export async function listCalendars(): Promise<ApiResult<GoogleCalendarListEntry[]>> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callApi<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>("users/me/calendarList", pageToken ? { pageToken } : {});
    if (!result.ok) return result;
    calendars.push(...(result.data.items ?? []));
    if (!result.data.nextPageToken) return { ok: true, data: calendars };
    pageToken = result.data.nextPageToken;
  }
  return { ok: false, message: "Calendar list exceeded the pagination limit; no partial list returned.", reason: "error" };
}

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  /** ISO with a real offset for timed events; Google always reports it already converted to the calendar's own timeZone. */
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  /** Present only on an expanded instance of a recurring event (singleEvents=true expands series into these). */
  recurringEventId?: string;
  status: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
};

const PAGE_SIZE = 250; // Conservative page size; Google's maximum is 2500.
const MAX_PAGES = 20;

/**
 * Read-only. `singleEvents=true` is what turns a recurring series into its
 * individual instances (each with its own start/end and a recurringEventId
 * back-reference) — without it, a weekly job shows up as ONE object with an
 * opaque recurrence rule, not the actual dated occurrences a schedule view
 * needs. `orderBy=startTime` is only valid combined with singleEvents=true.
 * Paginates via Google's own nextPageToken rather than assuming one page is
 * everything.
 */
export async function listEvents(calendarId: string, range: { from: string; to: string }): Promise<ApiResult<{ events: GoogleCalendarEvent[]; pages: number }>> {
  let bounds: { timeMin: string; timeMax: string };
  try { bounds = calendarTimeBounds(range); } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid date range.", reason: "error" };
  }
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      ...bounds,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(PAGE_SIZE),
      showDeleted: "false",
    };
    if (pageToken) params.pageToken = pageToken;
    const result = await callApi<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(`calendars/${encodeURIComponent(calendarId)}/events`, params);
    if (!result.ok) return result;
    events.push(...(result.data.items ?? []).filter((e) => e.status !== "cancelled"));
    if (!result.data.nextPageToken) return { ok: true, data: { events, pages: page + 1 } };
    pageToken = result.data.nextPageToken;
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}
