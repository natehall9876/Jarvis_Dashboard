"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCalendarStart } from "@/lib/integrations/google-calendar-display";
import { formatDateOnly } from "@/lib/format";
import {
  disconnectGoogleCalendarAction,
  listGoogleCalendars,
  previewGoogleCalendarEvents,
  selectGoogleCalendar,
  type ListCalendarsResult,
  type PreviewGoogleCalendarResult,
} from "@/lib/actions/google-calendar";

/**
 * Read-only calendar access. Deliberately no "sync to Jarvis" button —
 * calendar events are previewed here only, never written into the jobs
 * table, so they can never double-count as scheduled work.
 */
export function GoogleCalendarConnectionCard({
  connected,
  connectedAt,
  selectedCalendarId,
  selectedCalendarSummary,
  configured,
  statusError,
  urlMessage,
}: {
  connected: boolean;
  connectedAt: string | null;
  selectedCalendarId: string | null;
  selectedCalendarSummary: string | null;
  configured: boolean;
  statusError: string | null;
  urlMessage: { status: "connected" | "error"; message?: string } | null;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<ListCalendarsResult | null>(null);
  const [preview, setPreview] = useState<PreviewGoogleCalendarResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [listPending, startListTransition] = useTransition();
  const [previewPending, startPreviewTransition] = useTransition();

  const busy = pending || listPending || previewPending;
  const needsReconnect = (calendars && !calendars.ok && calendars.reason === "reauth_required") || (preview && !preview.ok && preview.reason === "reauth_required");
  const verifiedAt = preview?.ok ? preview.verifiedAt : calendars?.ok ? calendars.verifiedAt : null;

  function loadCalendars() {
    setActionError(null);
    setPreview(null);
    setCalendars(null);
    startListTransition(async () => {
      try {
        setCalendars(await listGoogleCalendars());
      } catch {
        setActionError("Calendar list could not be loaded. Check your connection and try again.");
      }
    });
  }
  function pickCalendar(id: string, summary: string) {
    if (!calendars?.ok) return;
    const version = calendars.connectionVersion;
    setPreview(null);
    setActionError(null);
    startTransition(async () => {
      try {
        const selected = await selectGoogleCalendar(id, summary, version);
        if (!selected.ok) { setActionError(selected.message); return; }
        setCalendars(null);
        router.refresh();
      } catch {
        setActionError("Calendar selection could not be confirmed. Reload Settings to check which calendar is saved before trying again.");
      }
    });
  }
  function runPreview() {
    if (!selectedCalendarId) return;
    setActionError(null);
    setCalendars(null);
    setPreview(null);
    startPreviewTransition(async () => {
      try {
        setPreview(await previewGoogleCalendarEvents(selectedCalendarId));
      } catch {
        setActionError("Calendar preview could not be loaded. Check your connection and try again.");
      }
    });
  }
  function disconnectNow() {
    setActionError(null);
    startTransition(async () => {
      try {
        const disconnected = await disconnectGoogleCalendarAction();
        if (!disconnected.ok) { setActionError(disconnected.message); return; }
        setCalendars(null);
        setPreview(null);
        router.refresh();
      } catch {
        setActionError("Disconnect could not be confirmed. Reload Settings to check the saved authorization before trying again.");
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Google Calendar" description="Read-only. Previewed separately from Homeworks jobs — never merged into the schedule, so nothing is ever double-counted." />
      <CardBody className="space-y-3">
        {actionError ? <p role="alert" className="text-xs text-[var(--color-critical)]">{actionError}</p> : null}
        {urlMessage?.status === "error" ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {urlMessage.message ?? "The connection attempt failed."}
          </p>
        ) : null}
        {urlMessage?.status === "connected" && connected ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {selectedCalendarId ? "Authorization saved. Calendar selected." : "Authorization saved - pick a calendar below."}
          </p>
        ) : null}

        {statusError ? <p role="alert" className="text-xs text-[var(--color-critical)]">{statusError}</p> : null}
        {!configured ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-4">
              <p className="text-sm font-medium text-[var(--color-warning)]">Setup required</p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Jarvis needs its Google app credentials before you can sign in and choose a calendar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-accent)] px-4 text-sm font-medium text-[#062012]">Open Google Calendar</a>
            </div>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">Google Calendar opens directly above. Linking its events inside Jarvis is a separate one-time OAuth setup; until then, Jarvis cannot read your calendar automatically.</p>
            <details className="text-xs leading-5 text-[var(--color-text-secondary)]">
              <summary className="cursor-pointer py-2 font-medium">Deployment setup details</summary>
              <ol className="mt-2 list-decimal space-y-3 pl-4">
                <li>Enable the Google Calendar API and create a web application OAuth client.</li>
                <li>Add this exact redirect URI:<code className="mt-1 block break-all rounded-lg bg-[var(--color-surface-3)] p-2">https://jarvis-dashboard-weedeater.vercel.app/api/integrations/google-calendar/oauth/callback</code></li>
                <li>Set <code>GOOGLE_CALENDAR_CLIENT_ID</code> and <code>GOOGLE_CALENDAR_CLIENT_SECRET</code> in the production deployment, then redeploy.</li>
                <li>Return here, connect your Google account, choose a calendar, and preview events to verify access.</li>
              </ol>
            </details>
          </div>
        ) : statusError ? null : !connected ? (
          <a
            href="/api/integrations/google-calendar/oauth/connect"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
          >
            Connect Google Calendar
          </a>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">{needsReconnect ? "Needs reconnect" : verifiedAt ? "Verified live at " + formatCalendarStart(verifiedAt) : "Saved authorization - not verified in this view"}</p>
            {needsReconnect ? <a className="inline-flex min-h-11 items-center text-sm text-[var(--color-accent)] underline" href="/api/integrations/google-calendar/oauth/connect">Reconnect Google Calendar</a> : null}
            <p className="text-xs text-[var(--color-text-secondary)]">
              Token on file since {connectedAt ? formatCalendarStart(connectedAt) : "unknown"}.{" "}
              {selectedCalendarSummary ? (
                <>Selected calendar: <span className="break-all text-[var(--color-text-primary)]">{selectedCalendarSummary}</span>.</>
              ) : (
                "No calendar selected yet."
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={loadCalendars} disabled={busy}>
                {listPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {selectedCalendarId ? "Change calendar" : "Choose a calendar"}
              </Button>
              {selectedCalendarId ? (
                <Button type="button" variant="secondary" onClick={runPreview} disabled={busy}>
                  {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Preview next 14 days (read-only)
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={disconnectNow} disabled={busy}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {calendars && !calendars.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {calendars.message}
          </p>
        ) : null}
        {calendars && calendars.ok ? (
          <ul className="space-y-1">
            {calendars.calendars.map((cal) => (
              <li key={cal.id}>
                <button
                  type="button"
                  onClick={() => pickCalendar(cal.id, cal.summary)}
                  disabled={busy}
                  className={`min-h-11 w-full break-words rounded-md border px-2.5 py-1.5 text-left text-xs ${
                    selectedCalendarId === cal.id ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]"
                  }`}
                >
                  {cal.summary}
                  {cal.primary ? " (primary)" : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {preview && !preview.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {preview.message}
          </p>
        ) : null}
        {preview && preview.ok ? (
          <div className="space-y-1 text-xs">
            <p className="text-[var(--color-text-secondary)]">
              {preview.events.length} event{preview.events.length === 1 ? "" : "s"} from {formatDateOnly(preview.range.from)} to {formatDateOnly(preview.range.to)}. Times shown in Eastern time.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {preview.events.map((e) => (
                <li key={e.id} className="break-words text-[var(--color-text-muted)]">
                  {formatCalendarStart(e.start, e.isAllDay)} — <span className="text-[var(--color-text-primary)]">{e.summary}</span>
                  {e.isRecurringInstance ? " (recurring)" : ""}
                  {e.isAllDay ? " (all-day)" : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
