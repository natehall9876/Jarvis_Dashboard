"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    startListTransition(async () => setCalendars(await listGoogleCalendars()));
  }
  function pickCalendar(id: string, summary: string) {
    if (!calendars?.ok) return;
    const version = calendars.connectionVersion;
    setPreview(null);
    setActionError(null);
    startTransition(async () => {
      const selected = await selectGoogleCalendar(id, summary, version);
      if (!selected.ok) { setActionError(selected.message); return; }
      setCalendars(null);
      router.refresh();
    });
  }
  function runPreview() {
    if (!selectedCalendarId) return;
    setActionError(null);
    setCalendars(null);
    setPreview(null);
    startPreviewTransition(async () => setPreview(await previewGoogleCalendarEvents(selectedCalendarId)));
  }
  function disconnectNow() {
    startTransition(async () => {
      const disconnected = await disconnectGoogleCalendarAction();
      if (!disconnected.ok) { setActionError(disconnected.message); return; }
      setActionError(null);
      setCalendars(null);
      setPreview(null);
      router.refresh();
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
            Authorization saved - pick a calendar below.
          </p>
        ) : null}

        {statusError ? <p role="alert" className="text-xs text-[var(--color-critical)]">{statusError}</p> : null}
        {!configured ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Not configured — <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">GOOGLE_CALENDAR_CLIENT_ID</code> and{" "}
            <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">GOOGLE_CALENDAR_CLIENT_SECRET</code> are missing. Create an OAuth client at{" "}
            <span className="text-[var(--color-text-secondary)]">console.cloud.google.com</span> with redirect URI{" "}
            <code className="break-all rounded bg-[var(--color-surface-3)] px-1 py-0.5">https://jarvis-dashboard-fawn.vercel.app/api/integrations/google-calendar/oauth/callback</code>, and enable the Calendar API.
          </p>
        ) : statusError ? null : !connected ? (
          <a
            href="/api/integrations/google-calendar/oauth/connect"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
          >
            Connect Google Calendar
          </a>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">{needsReconnect ? "Needs reconnect" : verifiedAt ? "Verified live at " + new Date(verifiedAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "Saved authorization - not verified in this view"}</p>
            {needsReconnect ? <a className="inline-flex min-h-11 items-center text-sm text-[var(--color-accent)] underline" href="/api/integrations/google-calendar/oauth/connect">Reconnect Google Calendar</a> : null}
            <p className="text-xs text-[var(--color-text-secondary)]">
              Token on file since {connectedAt ? new Date(connectedAt).toLocaleString() : "unknown"}.{" "}
              {selectedCalendarSummary ? (
                <>Selected calendar: <span className="text-[var(--color-text-primary)]">{selectedCalendarSummary}</span>.</>
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
                  className={`min-h-11 w-full rounded-md border px-2.5 py-1.5 text-left text-xs ${
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
              {preview.events.length} event{preview.events.length === 1 ? "" : "s"} from {preview.range.from} to {preview.range.to}.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {preview.events.map((e) => (
                <li key={e.id} className="text-[var(--color-text-muted)]">
                  {e.start} — <span className="text-[var(--color-text-primary)]">{e.summary}</span>
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
