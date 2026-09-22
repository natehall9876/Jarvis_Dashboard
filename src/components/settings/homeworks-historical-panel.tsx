"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmHistoricalSync, previewHistoricalSync, type HistoricalConfirmResult, type HistoricalPreviewResult } from "@/lib/actions/homeworks-historical";
import { addDaysISO, todayInZone, validateRange, type DateRange } from "@/lib/integrations/homeworks-dates";

/**
 * One-time (repeatable) backfill of completed Homeworks work into Jarvis job
 * history. Read-only preview; confirm only INSERTS events that don't already
 * have a Jarvis job (see homeworks-historical.ts) — it can never touch an
 * existing job, active-synced or otherwise.
 */
export function HomeworksHistoricalPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<"30" | "90" | "180" | "custom">("90");
  const [from, setFrom] = useState(() => addDaysISO(todayInZone(), -90));
  const [to, setTo] = useState(() => todayInZone());
  const [preview, setPreview] = useState<HistoricalPreviewResult | null>(null);
  const [result, setResult] = useState<HistoricalConfirmResult | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  const range = (): DateRange => (mode === "custom" ? { from, to } : { from: addDaysISO(todayInZone(), -Number(mode)), to: todayInZone() });
  const check = validateRange(range());

  function runPreview() {
    setPreview(null);
    setResult(null);
    startPreview(async () => setPreview(await previewHistoricalSync(range())));
  }

  function runConfirm() {
    if (!preview || !preview.ok) return;
    const t = preview.plan.totals;
    const ok = window.confirm(
      `Add ${t.wouldCreate} completed job(s) to service history, creating ${preview.plan.servicesToCreate.length} new service(s)?\n\n` +
        `This only adds jobs Jarvis doesn't already have (by Homeworks event ID). It never edits or removes an existing job.`,
    );
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmHistoricalSync(range());
      setResult(res);
      if (res.ok) {
        router.refresh();
        setPreview(await previewHistoricalSync(range()));
      }
    });
  }

  const p = preview && preview.ok ? preview : null;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium text-[var(--color-text-primary)]">Completed-work history (backfill)</p>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Adds past completed Homeworks jobs to service history. Never touches a job Jarvis already has — safe to run repeatedly.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(["30", "90", "180", "custom"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setPreview(null);
              setResult(null);
            }}
            className={`rounded-md border px-2 py-1 ${mode === m ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]"}`}
          >
            {m === "custom" ? "Custom" : `Last ${m} days`}
          </button>
        ))}
        {mode === "custom" ? (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Start date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
            <span className="text-[var(--color-text-muted)]">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="End date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
          </>
        ) : null}
      </div>
      {!check.ok ? <p className="text-[11px] text-[var(--color-critical)]">{check.message}</p> : null}
      <Button type="button" variant="secondary" onClick={runPreview} disabled={previewPending || !check.ok}>
        {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Preview completed-work history (read-only)
      </Button>

      {preview && !preview.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {preview.message}
        </p>
      ) : null}

      {p ? (
        <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {p.plan.totals.events} Homeworks event{p.plan.totals.events === 1 ? "" : "s"} in {p.meta.range.from} to {p.meta.range.to} ({p.meta.pages} page{p.meta.pages === 1 ? "" : "s"}).
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {[
              ["Will add", p.plan.totals.wouldCreate, "text-[var(--color-accent)]"],
              ["Already have", p.plan.totals.alreadySynced, "text-[var(--color-text-primary)]"],
              ["Property not linked", p.plan.totals.blocked, "text-[var(--color-warning)]"],
              ["Not completed / deleted", p.plan.totals.other, "text-[var(--color-text-muted)]"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className={`text-lg font-semibold ${tone}`}>{n as number}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>
          {p.plan.servicesToCreate.length > 0 ? (
            <p className="text-[11px] text-[var(--color-text-secondary)]">New services to create: {p.plan.servicesToCreate.map((s) => `"${s.name}"`).join(", ")}.</p>
          ) : null}
          {p.plan.totals.wouldCreate > 0 ? (
            <Button type="button" onClick={runConfirm} disabled={confirmPending} className="w-full justify-center">
              {confirmPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm — add {p.plan.totals.wouldCreate} completed job(s) to history
            </Button>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Nothing new to add for this range.</p>
          )}
        </div>
      ) : null}

      {result && !result.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.message}
        </p>
      ) : null}
      {result && result.ok ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-[var(--color-accent)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Added {result.created} completed job(s); created {result.servicesCreated} service(s); {result.skipped} already existed
          {result.errors ? `; ${result.errors} error(s)` : ""}.
        </p>
      ) : null}
    </div>
  );
}
