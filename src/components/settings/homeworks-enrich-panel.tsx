"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmHomeworksEnrichment, previewHomeworksEnrichment, type EnrichConfirmResult, type EnrichPreviewResult } from "@/lib/actions/homeworks-enrich";
import { addDaysISO, rangeForDays, todayInZone, validateRange, type DateRange } from "@/lib/integrations/homeworks-dates";

const FIELD_LABEL = { service: "Service", budgeted_hours: "Budgeted hours", scheduled_start_time: "Start time" } as const;

/**
 * Enrichment of EXISTING jobs (service name, budgeted hours, real start time).
 * The preview is read-only. Confirm only fills blank fields, in place, by
 * Homeworks event ID — it never creates jobs and never replaces a value that is
 * already set in Jarvis.
 */
export function HomeworksEnrichPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<"7" | "14" | "30" | "custom">("30");
  const [from, setFrom] = useState(() => todayInZone());
  const [to, setTo] = useState(() => addDaysISO(todayInZone(), 30));
  const [preview, setPreview] = useState<EnrichPreviewResult | null>(null);
  const [result, setResult] = useState<EnrichConfirmResult | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [confirmPending, startConfirm] = useTransition();

  const range = (): DateRange => (mode === "custom" ? { from, to } : rangeForDays(Number(mode)));
  const check = validateRange(range());

  function runPreview() {
    setPreview(null);
    setResult(null);
    startPreview(async () => setPreview(await previewHomeworksEnrichment(range())));
  }

  function runConfirm() {
    if (!preview || !preview.ok) return;
    const t = preview.plan.totals;
    const ok = window.confirm(
      `Fill ${t.fieldsToFill} blank field(s) on ${t.update} existing job(s), creating ${preview.plan.servicesToCreate.length} new service(s)?\n\n` +
        `Only blank fields are filled. Nothing you entered is overwritten, no jobs are created, and no external IDs change.`,
    );
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmHomeworksEnrichment(range());
      setResult(res);
      if (res.ok) {
        router.refresh();
        setPreview(await previewHomeworksEnrichment(range()));
      }
    });
  }

  const p = preview && preview.ok ? preview : null;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium text-[var(--color-text-primary)]">Job enrichment (service &amp; budgeted hours)</p>
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Fills the service name and budgeted hours on jobs you already have, from the Homeworks event&apos;s line items. Blank fields only — anything already set
        in Jarvis is left alone.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(["7", "14", "30", "custom"] as const).map((m) => (
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
            {m === "custom" ? "Custom" : `Next ${m} days`}
          </button>
        ))}
        {mode === "custom" ? (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Enrichment start date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
            <span className="text-[var(--color-text-muted)]">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Enrichment end date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
          </>
        ) : null}
      </div>
      {!check.ok ? <p className="text-[11px] text-[var(--color-critical)]">{check.message}</p> : null}
      <Button type="button" variant="secondary" onClick={runPreview} disabled={previewPending || !check.ok}>
        {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Preview enrichment (read-only)
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
            {p.plan.totals.events} Homeworks events in {p.meta.range.from} to {p.meta.range.to} ({p.meta.pages} page{p.meta.pages === 1 ? "" : "s"}); {p.plan.totals.matchedJobs}{" "}
            match existing Jarvis jobs by event ID; {p.plan.totals.notInJarvis} are not in Jarvis (enrichment never creates jobs — use job sync).
          </p>
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {[
              ["Jobs to update", p.plan.totals.update, "text-[var(--color-accent)]"],
              ["Unchanged", p.plan.totals.unchanged, "text-[var(--color-text-primary)]"],
              ["Need review", p.plan.totals.review, "text-[var(--color-warning)]"],
              ["Blank fields to fill", p.plan.totals.fieldsToFill, "text-[var(--color-info)]"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className={`text-lg font-semibold ${tone}`}>{n as number}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>
          {p.plan.servicesToCreate.length > 0 ? (
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              New services that will be created (no Jarvis service has these names): {p.plan.servicesToCreate.map((s) => `"${s.name}"`).join(", ")}.
            </p>
          ) : null}
          <p className="text-[11px] text-[var(--color-text-muted)]">Left unchanged always: price, status, notes, photos, crew, dates, and every Homeworks and Jarvis ID.</p>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--color-text-secondary)]">Before / after for {p.plan.rows.length} matched job{p.plan.rows.length === 1 ? "" : "s"}</summary>
            <ul className="mt-1.5 max-h-96 space-y-2 overflow-y-auto">
              {p.plan.rows.map((r) => (
                <li key={r.hwId} className="rounded-md border border-[var(--color-border)] p-2 text-[11px] text-[var(--color-text-muted)]">
                  <div>
                    <span className="text-[var(--color-text-primary)]">{r.customer}</span> · {r.property} · {r.date ?? "no date"} ·{" "}
                    <span className={r.status === "update" ? "text-[var(--color-accent)]" : r.status === "review" ? "text-[var(--color-warning)]" : ""}>{r.status}</span>
                  </div>
                  {r.changes.map((c) => (
                    <div key={c.field}>
                      {FIELD_LABEL[c.field]}: <span className="line-through">{c.before ?? "Not set"}</span> → <span className="text-[var(--color-text-primary)]">{c.after}</span>
                    </div>
                  ))}
                  {r.kept.map((k) => (
                    <div key={k.field}>
                      {FIELD_LABEL[k.field]}: keeps &ldquo;{k.jarvis}&rdquo; (Homeworks has &ldquo;{k.homeworks}&rdquo;)
                    </div>
                  ))}
                  {r.changes.length === 0 && r.kept.length === 0 ? <div>{r.reason}</div> : null}
                </li>
              ))}
            </ul>
          </details>

          {p.plan.totals.update > 0 ? (
            <Button type="button" onClick={runConfirm} disabled={confirmPending} className="w-full justify-center">
              {confirmPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm enrichment — update existing HomeWorks jobs
            </Button>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Nothing to fill right now.</p>
          )}
        </div>
      ) : null}

      {result && !result.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Enrichment failed: {result.message}
        </p>
      ) : null}
      {result && result.ok ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-[var(--color-accent)]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Filled {result.fieldsFilled} field(s) on {result.jobsUpdated} job(s); created {result.servicesCreated} service(s); {result.skipped} skipped
          {result.errors ? `; ${result.errors} error(s)` : ""}. The preview above was re-run.
        </p>
      ) : null}
    </div>
  );
}
