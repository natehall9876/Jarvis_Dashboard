"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reconcileHomeworksDay, type ReconcileActionResult } from "@/lib/actions/homeworks-reconcile";
import { BUSINESS_TIMEZONE, todayInZone } from "@/lib/integrations/homeworks-dates";

const STATE_TONE = {
  matched: "text-[var(--color-accent)]",
  missing: "text-[var(--color-critical)]",
  extra: "text-[var(--color-warning)]",
} as const;

/** Read-only. Compares one calendar day in Homeworks against Jarvis by canonical event ID and explains every difference. */
export function HomeworksReconcilePanel() {
  const [date, setDate] = useState(() => todayInZone());
  const [result, setResult] = useState<ReconcileActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => setResult(await reconcileHomeworksDay(date)));
  }

  const r = result && result.ok ? result : null;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium text-[var(--color-text-primary)]">Schedule reconciliation (read-only)</p>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Compares one day in Homeworks against Jarvis by Homeworks event ID and explains every job that is missing or extra. Dates use{" "}
        {BUSINESS_TIMEZONE} calendar days — not UTC.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
          aria-label="Day to reconcile"
        />
        <Button type="button" variant="secondary" onClick={run} disabled={pending || !date}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Reconcile this day
        </Button>
      </div>

      {result && !result.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.message}
        </p>
      ) : null}

      {r ? (
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
            Homeworks fetch: {r.meta.pages} page{r.meta.pages === 1 ? "" : "s"} of up to {r.meta.pageSize}, {r.meta.rawCount} row{r.meta.rawCount === 1 ? "" : "s"} returned,{" "}
            {r.meta.duplicates} duplicate{r.meta.duplicates === 1 ? "" : "s"} dropped.
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead className="text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-1 pr-2">Result</th>
                  <th className="pr-2">Event ID</th>
                  <th className="pr-2">Customer</th>
                  <th className="pr-2">Property</th>
                  <th className="pr-2">Local time</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {r.result.rows.map((row) => (
                  <tr key={`${row.state}-${row.hwId ?? row.jarvisJobId}`} className="border-t border-[var(--color-border)] align-top text-[var(--color-text-secondary)]">
                    <td className={`py-1 pr-2 font-medium ${STATE_TONE[row.state]}`}>{row.state}</td>
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
        </div>
      ) : null}
    </div>
  );
}
