import { isISODate } from "@/lib/integrations/homeworks-dates";
import { fetchApiJson, invalidApiResponse, isRecord, type ApiFailure } from "@/lib/integrations/api-response";
import { calendarTimeBounds } from "@/lib/integrations/google-calendar-dates";
import { getValidAccessToken, type ValidTokenResult } from "@/lib/integrations/google-calendar-connection";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

type ApiResult<T> = { ok: true; data: T; connectionVersion?: string } | { ok: false; message: string; reason?: "not_connected" | ApiFailure["reason"] };

async function callApi<T>(path: string, searchParams?: Record<string, string>, snapshot?: ValidTokenResult): Promise<ApiResult<T>> {
  const token = snapshot ?? await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message, reason: token.reason === "not_connected" || token.reason === "reauth_required" ? token.reason : "error" };

  const url = new URL(`${CALENDAR_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(searchParams ?? {})) url.searchParams.set(k, v);

  const result = await fetchApiJson<T & { items?: unknown; nextPageToken?: unknown; kind?: string }>("Google Calendar", url.toString(), { headers: { authorization: `Bearer ${token.accessToken}` } });
  if (!result.ok) return result;
  const data = result.data;
  if (!("items" in data) && !("nextPageToken" in data) && !(typeof data.kind === "string" && data.kind.startsWith("calendar#"))) return invalidApiResponse("Google Calendar");
  if ((data.items !== undefined && (!Array.isArray(data.items) || !data.items.every(item => isRecord(item) && typeof item.id === "string" && item.id.length > 0)))
    || (data.nextPageToken !== undefined && (typeof data.nextPageToken !== "string" || !data.nextPageToken))) return invalidApiResponse("Google Calendar");
  return { ok: true, data };
}

export type GoogleCalendarListEntry = { id: string; summary: string; primary?: boolean };

/** Read-only. Powers the calendar-selection step after connecting. */
export async function listCalendars(): Promise<ApiResult<GoogleCalendarListEntry[]>> {
  const snapshot = await getValidAccessToken();
  const calendars = new Map<string, GoogleCalendarListEntry>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await callApi<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>("users/me/calendarList", pageToken ? { pageToken } : {}, snapshot);
    if (!result.ok) return result;
    for (const item of result.data.items ?? []) calendars.set(item.id, item);
    if (!result.data.nextPageToken) return { ok: true, data: [...calendars.values()], connectionVersion: snapshot.ok ? snapshot.connectionVersion : undefined };
    if (seenTokens.has(result.data.nextPageToken)) return { ok: false, reason: "error", message: "Google Calendar repeated a page token; no partial result was used." };
    seenTokens.add(result.data.nextPageToken);
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
  const snapshot = await getValidAccessToken();
  const events = new Map<string, GoogleCalendarEvent>();
  const seenTokens = new Set<string>();
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
    const result = await callApi<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(`calendars/${encodeURIComponent(calendarId)}/events`, params, snapshot);
    if (!result.ok) return result;
    if (!(result.data.items ?? []).every(event => event.status === "cancelled" || (
      isRecord(event.start) && isRecord(event.end) &&
      ((typeof event.start.date === "string" && isISODate(event.start.date)) ||
        (typeof event.start.dateTime === "string" && Number.isFinite(Date.parse(event.start.dateTime))))
    ))) return invalidApiResponse("Google Calendar");
    for (const event of result.data.items ?? []) {
      if (event.status === "cancelled") events.delete(event.id);
      else events.set(event.id, event);
    }
    if (!result.data.nextPageToken) return { ok: true, data: { events: [...events.values()], pages: page + 1 } };
    if (seenTokens.has(result.data.nextPageToken)) return { ok: false, reason: "error", message: "Google Calendar repeated a page token; no partial result was used." };
    seenTokens.add(result.data.nextPageToken);
    pageToken = result.data.nextPageToken;
  }
  return { ok: false, message: `Stopped after ${MAX_PAGES} pages without reaching the end.`, reason: "error" };
}
