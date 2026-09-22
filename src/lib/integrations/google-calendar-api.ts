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
  const result = await callApi<{ items: GoogleCalendarListEntry[] }>("users/me/calendarList");
  if (!result.ok) return result;
  return { ok: true, data: result.data.items };
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

const PAGE_SIZE = 250; // Google's own max per page
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
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = {
      timeMin: new Date(`${range.from}T00:00:00`).toISOString(),
      timeMax: new Date(`${range.to}T23:59:59`).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(PAGE_SIZE),
      showDeleted: "false",
    };
    if (pageToken) params.pageToken = pageToken;
    const result = await callApi<{ items: GoogleCalendarEvent[]; nextPageToken?: string }>(`calendars/${encodeURIComponent(calendarId)}/events`, params);
    if (!result.ok) return result;
    events.push(...result.data.items.filter((e) => e.status !== "cancelled"));
    if (!result.data.nextPageToken) return { ok: true, data: { events, pages: page + 1 } };
    pageToken = result.data.nextPageToken;
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}
