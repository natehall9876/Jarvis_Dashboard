"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reconcileHomeworksDay, reconcileHomeworksRange, type ReconcileActionResult, type ReconcileRangeActionResult } from "@/lib/actions/homeworks-reconcile";
import { BUSINESS_TIMEZONE, todayInZone, addDaysISO } from "@/lib/integrations/homeworks-dates";
import type { ReconRow } from "@/lib/integrations/homeworks-reconcile";

const STATE_TONE = {
  matched: "text-[var(--color-accent)]",
  missing: "text-[var(--color-critical)]",
  extra: "text-[var(--color-warning)]",
} as const;

function RowsTable({ rows, showDate }: { rows: (ReconRow & { forDate?: string })[]; showDate: boolean }) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full min-w-[640px] text-left text-[11px]">
        <thead className="text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1 pr-2">Result</th>
            {showDate ? <th className="pr-2">Date</th> : null}
            <th className="pr-2">Event ID</th>
            <th className="pr-2">Customer</th>
            <th className="pr-2">Property</th>
            <th className="pr-2">Local time</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.forDate ?? ""}-${row.state}-${row.hwId ?? row.jarvisJobId}-${i}`} className="border-t border-[var(--color-border)] align-top text-[var(--color-text-secondary)]">
              <td className={`py-1 pr-2 font-medium ${STATE_TONE[row.state]}`}>{row.state}</td>
              {showDate ? <td className="pr-2">{row.forDate}</td> : null}
              <td className="pr-2">{row.hwId ?? "(none)"}</td>
              <td className="pr-2 text-[var(--color-text-primary)]">{row.customer}</td>
              <td className="pr-2">{row.property}</td>
              <td className="pr-2">
                {row.localDate} · {row.localTime}
              </td>
              <td>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Read-only. Compares Homeworks against Jarvis by canonical Homeworks event
 * ID and explains every job that is missing or extra — either for one
 * calendar day, or for an arbitrary range (capped at 92 days). Both modes
 * use the app's own real data-access path: the authenticated Homeworks
 * direct-API connection and the signed-in owner's own Jarvis database —
 * never a one-off script, and never anything that writes to either system.
 * Numbers shown are whatever is true at the moment "Reconcile" is clicked —
 * re-running it re-fetches both sources fresh.
 */
export function HomeworksReconcilePanel() {
  const [mode, setMode] = useState<"day" | "range">("day");
  const [date, setDate] = useState(() => todayInZone());
  const [from, setFrom] = useState(() => todayInZone());
  const [to, setTo] = useState(() => addDaysISO(todayInZone(), 6));
  const [dayResult, setDayResult] = useState<ReconcileActionResult | null>(null);
  const [rangeResult, setRangeResult] = useState<ReconcileRangeActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function runDay() {
    setDayResult(null);
    startTransition(async () => setDayResult(await reconcileHomeworksDay(date)));
  }
  function runRange() {
    setRangeResult(null);
    startTransition(async () => setRangeResult(await reconcileHomeworksRange(from, to)));
  }
  function preset(days: number) {
    const start = todayInZone();
    setFrom(start);
    setTo(addDaysISO(start, days));
  }

  const r = dayResult && dayResult.ok ? dayResult : null;
  const rr = rangeResult && rangeResult.ok ? rangeResult : null;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">Schedule reconciliation (read-only)</p>
        <div className="flex gap-1 rounded-md bg-[var(--color-surface-2)] p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode("day")}
            className={`rounded px-2 py-1 ${mode === "day" ? "bg-[var(--color-surface-1)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}
          >
            One day
          </button>
          <button
            type="button"
            onClick={() => setMode("range")}
            className={`rounded px-2 py-1 ${mode === "range" ? "bg-[var(--color-surface-1)] text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"}`}
          >
            Date range
          </button>
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Compares Homeworks against Jarvis by Homeworks event ID and explains every job that is missing or extra. Dates use {BUSINESS_TIMEZONE} calendar days — not UTC. Numbers are as of the moment you click
        Reconcile, not cached from an earlier check.
      </p>

      {mode === "day" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            aria-label="Day to reconcile"
          />
          <Button type="button" variant="secondary" onClick={runDay} disabled={pending || !date}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Reconcile this day
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            aria-label="Range start"
          />
          <span className="text-xs text-[var(--color-text-muted)]">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            aria-label="Range end"
          />
          <Button type="button" variant="ghost" onClick={() => preset(6)}>
            This week
          </Button>
          <Button type="button" variant="ghost" onClick={() => preset(29)}>
            Next 30 days
          </Button>
          <Button type="button" variant="secondary" onClick={runRange} disabled={pending || !from || !to}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Reconcile this range
          </Button>
        </div>
      )}

      {mode === "day" && dayResult && !dayResult.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {dayResult.message}
        </p>
      ) : null}
      {mode === "range" && rangeResult && !rangeResult.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {rangeResult.message}
        </p>
      ) : null}

      {mode === "day" && r ? (
        <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
            {r.result.totals.missing === 0 && r.result.totals.extra === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : <TriangleAlert className="h-3.5 w-3.5 text-[var(--color-warning)]" />}
            {r.weekday} {r.result.date}
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
            {[
              ["Homeworks jobs", r.result.totals.homeworks],
              ["Jarvis jobs", r.result.totals.jarvis],
              ["Matching IDs", r.result.totals.matched],
              ["Missing in Jarvis", r.result.totals.missing],
              ["Extra in Jarvis", r.result.totals.extra],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-lg font-semibold text-[var(--color-text-primary)]">{n as number}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Homeworks fetch: {r.meta.pages} page{r.meta.pages === 1 ? "" : "s"} of up to {r.meta.pageSize}, {r.meta.rawCount} row{r.meta.rawCount === 1 ? "" : "s"} returned, {r.meta.duplicates} duplicate
            {r.meta.duplicates === 1 ? "" : "s"} dropped.
          </p>
          <RowsTable rows={r.result.rows} showDate={false} />
        </div>
      ) : null}

      {mode === "range" && rr ? (
        <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-primary)]">
            {rr.result.totals.missing === 0 && rr.result.totals.extra === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : <TriangleAlert className="h-3.5 w-3.5 text-[var(--color-warning)]" />}
            {rr.result.from} through {rr.result.to} — refreshed {new Date(rr.refreshedAt).toLocaleTimeString("en-US", { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" })}
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-6">
            {[
              ["Homeworks job-days", rr.result.totals.homeworks],
              ["Unique HW events", rr.result.uniqueHomeworksEvents],
              ["Jarvis jobs", rr.result.totals.jarvis],
              ["Matching IDs", rr.result.totals.matched],
              ["Missing in Jarvis", rr.result.totals.missing],
              ["Extra in Jarvis", rr.result.totals.extra],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-lg font-semibold text-[var(--color-text-primary)]">{n as number}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Homeworks fetch: {rr.meta.pages} page{rr.meta.pages === 1 ? "" : "s"} of up to {rr.meta.pageSize}, {rr.meta.rawCount} row{rr.meta.rawCount === 1 ? "" : "s"} returned, {rr.meta.duplicates} duplicate
            {rr.meta.duplicates === 1 ? "" : "s"} dropped. &quot;Homeworks job-days&quot; counts a multi-day event once per day it spans (matching the daily schedule view); &quot;Unique HW events&quot; counts each
            event once regardless of span.
          </p>
          <RowsTable
            rows={rr.result.days.flatMap((d) => d.rows.filter((row) => row.state !== "matched").map((row) => ({ ...row, forDate: d.date })))}
            showDate={true}
          />
          {rr.result.totals.missing === 0 && rr.result.totals.extra === 0 ? (
            <p className="text-[11px] text-[var(--color-accent)]">Every matched day is clean — only non-matching rows are listed above; {rr.result.totals.matched} matched rows are omitted for readability.</p>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)]">Only missing/extra rows are shown above ({rr.result.totals.matched} matched rows omitted for readability).</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
