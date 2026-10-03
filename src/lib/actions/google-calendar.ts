"use server";

import { revalidatePath } from "next/cache";
import { disconnectGoogleCalendar, selectCalendar } from "@/lib/integrations/google-calendar-connection";
import { listCalendars, listEvents, type GoogleCalendarEvent, type GoogleCalendarListEntry } from "@/lib/integrations/google-calendar-api";
import { rangeForDays, type DateRange } from "@/lib/integrations/homeworks-dates";

export type ListCalendarsResult = { ok: true; calendars: GoogleCalendarListEntry[]; connectionVersion: string; verifiedAt: string } | { ok: false; message: string; reason?: "not_connected" | "reauth_required" };

/** Read-only. Powers the calendar-selection step — an account can have several calendars, and nothing here guesses which one matters. */
export async function listGoogleCalendars(): Promise<ListCalendarsResult> {
  const result = await listCalendars();
  if (!result.ok) return { ok: false, message: result.message, reason: result.reason === "not_connected" || result.reason === "reauth_required" ? result.reason : undefined };
  if (!result.connectionVersion) return { ok: false, message: "Calendar authorization version is unavailable. Reload Settings and retry." };
  return { ok: true, calendars: result.data, connectionVersion: result.connectionVersion, verifiedAt: new Date().toISOString() };
}

export async function selectGoogleCalendar(calendarId: string, summary: string, connectionVersion: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await selectCalendar(calendarId, summary, connectionVersion);
  if (result.ok) revalidatePath("/settings");
  return result;
}

export type PreviewCalendarRow = { id: string; summary: string; start: string; isAllDay: boolean; isRecurringInstance: boolean };
export type PreviewGoogleCalendarResult = { ok: true; events: PreviewCalendarRow[]; range: DateRange; verifiedAt: string } | { ok: false; message: string; reason?: "not_connected" | "reauth_required" };

/**
 * Read-only, next 14 days by default. Kept entirely separate from Homeworks
 * jobs — this NEVER writes to the jobs table and is never merged into the
 * Schedule page's job list, so a calendar event can never be double-counted
 * as work. Timezone: Google always returns start/end already normalized to
 * the calendar's configured zone (or UTC for all-day dates), so no
 * additional conversion is applied here — the raw ISO value is preserved.
 */
export async function previewGoogleCalendarEvents(calendarId: string, days = 14): Promise<PreviewGoogleCalendarResult> {
  const range = rangeForDays(days);
  const result = await listEvents(calendarId, range);
  if (!result.ok) return { ok: false, message: result.message, reason: result.reason === "not_connected" || result.reason === "reauth_required" ? result.reason : undefined };
  const events: PreviewCalendarRow[] = result.data.events.map((e: GoogleCalendarEvent) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start.dateTime ?? e.start.date ?? "",
    isAllDay: !e.start.dateTime,
    isRecurringInstance: Boolean(e.recurringEventId),
  }));
  return { ok: true, events, range, verifiedAt: new Date().toISOString() };
}

export async function disconnectGoogleCalendarAction() {
  const result = await disconnectGoogleCalendar();
  if (result.ok) revalidatePath("/settings");
  return result;
}
