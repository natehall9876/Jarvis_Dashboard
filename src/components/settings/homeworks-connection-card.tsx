"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { verifyHomeworksConnection, disconnectHomeworksAction, type VerifyResult } from "@/lib/actions/homeworks-oauth";
import { previewHomeworksSync, type SyncPreviewResult } from "@/lib/actions/homeworks-sync-preview";
import { confirmHomeworksImport, type ImportResult } from "@/lib/actions/homeworks-import";
import { HomeworksLinkPanel } from "@/components/settings/homeworks-link-panel";
import { HomeworksReconcilePanel } from "@/components/settings/homeworks-reconcile-panel";
import { addDaysISO, rangeForDays, todayInZone, validateRange, type DateRange } from "@/lib/integrations/homeworks-dates";
import { previewHomeworksJobSync, confirmHomeworksJobImport, type JobPreviewResult, type JobImportResult } from "@/lib/actions/homeworks-job-sync";

/**
 * A "Connected" badge is not evidence (per explicit instruction) — this
 * card's real point is the Verify button, which actually calls the live
 * Homeworks GraphQL API for a handful of real customers and shows exactly
 * what came back, so "connected" means something checkable, not asserted.
 * "Preview Full Sync" goes further: paginates through every accessible
 * customer and compares against what's already in Jarvis, still entirely
 * read-only. "Confirm Import" only appears after a preview has actually
 * run in this session (real React state, not a URL param — refreshing
 * clears it), and asks for a native confirm() naming the exact counts
 * before doing anything, so an import can never fire from a stale or
 * unreviewed preview.
 */
export function HomeworksConnectionCard({
  connected,
  connectedAt,
  statusError,
  configured,
  urlMessage,
}: {
  connected: boolean;
  connectedAt: string | null;
  /** A real backend error reading the connection status — distinct from "just never connected yet". */
  statusError: string | null;
  configured: boolean;
  urlMessage: { status: "connected" | "error"; message?: string } | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [preview, setPreview] = useState<SyncPreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [jobPreview, setJobPreview] = useState<JobPreviewResult | null>(null);
  const [jobImportResult, setJobImportResult] = useState<JobImportResult | null>(null);
  const [rangeMode, setRangeMode] = useState<"7" | "14" | "30" | "custom">("7");
  const [customFrom, setCustomFrom] = useState(() => todayInZone());
  const [customTo, setCustomTo] = useState(() => addDaysISO(todayInZone(), 7));

  function currentRange(): DateRange {
    return rangeMode === "custom" ? { from: customFrom, to: customTo } : rangeForDays(Number(rangeMode));
  }
  const rangeCheck = validateRange(currentRange());
  const [pending, startTransition] = useTransition();
  const [previewPending, startPreviewTransition] = useTransition();
  const [importPending, startImportTransition] = useTransition();
  const [jobPreviewPending, startJobPreviewTransition] = useTransition();
  const [jobImportPending, startJobImportTransition] = useTransition();

  function verify() {
    setResult(null);
    setPreview(null);
    setImportResult(null);
    startTransition(async () => {
      setResult(await verifyHomeworksConnection());
    });
  }

  function runPreview() {
    setPreview(null);
    setImportResult(null);
    startPreviewTransition(async () => {
      setPreview(await previewHomeworksSync());
    });
  }

  function runImport() {
    if (!preview || !preview.ok) return;
    const confirmed = window.confirm(
      `Import ${preview.wouldCreate} new customer(s) and update ${preview.wouldUpdate} existing one(s) from Homeworks?\n\n` +
        `${preview.possibleDuplicates} unlinked match(es) will be skipped (use "Link existing records" instead).\n\nThis writes real records to your database.`,
    );
    if (!confirmed) return;
    setImportResult(null);
    startImportTransition(async () => {
      const res = await confirmHomeworksImport();
      setImportResult(res);
      if (res.ok) router.refresh();
    });
  }

  function runJobPreview() {
    setJobPreview(null);
    setJobImportResult(null);
    startJobPreviewTransition(async () => {
      setJobPreview(await previewHomeworksJobSync(currentRange()));
    });
  }

  function runJobImport() {
    if (!jobPreview || !jobPreview.ok) return;
    const confirmed = window.confirm(
      `Import ${jobPreview.wouldCreate} new job(s) and update ${jobPreview.wouldUpdate} existing one(s) from Homeworks?\n\n` +
        `${jobPreview.blockedNoProperty} job(s) can't sync yet (their property hasn't been imported) and will be skipped.\n\nThis writes real records to your database.`,
    );
    if (!confirmed) return;
    setJobImportResult(null);
    startJobImportTransition(async () => {
      const res = await confirmHomeworksJobImport(currentRange());
      setJobImportResult(res);
      if (res.ok) router.refresh();
    });
  }

  function disconnectNow() {
    startTransition(async () => {
      await disconnectHomeworksAction();
      setResult(null);
      setPreview(null);
      setImportResult(null);
      setJobPreview(null);
      setJobImportResult(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Homeworks (real API)"
        description="OAuth 2.1 + PKCE against api.home.works — separate from the Zapier-based import below, this is Jarvis authenticating directly to your Homeworks account."
      />
      <CardBody className="space-y-3">
        {urlMessage?.status === "error" ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {urlMessage.message ?? "The connection attempt failed."}
          </p>
        ) : null}
        {urlMessage?.status === "connected" ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Connected — click Verify below to confirm real data comes back.
          </p>
        ) : null}
        {statusError ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Couldn&apos;t read the connection status: {statusError}. If this mentions the table not existing, the
            <code className="mx-1 rounded bg-[var(--color-surface-3)] px-1 py-0.5">homeworks-oauth-migration.sql</code>
            migration hasn&apos;t been run yet.
          </p>
        ) : null}

        {!configured ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Not configured — <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">HOMEWORKS_OAUTH_CLIENT_ID</code> is missing.
          </p>
        ) : !connected ? (
          <a
            href="/api/integrations/homeworks/oauth/connect"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
          >
            Connect Homeworks
          </a>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Token on file since {connectedAt ? new Date(connectedAt).toLocaleString() : "unknown"}. This alone doesn&apos;t prove the connection
              works — verify below.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={verify} disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Verify — fetch 5 real customers
              </Button>
              <Button type="button" variant="secondary" onClick={runPreview} disabled={previewPending}>
                {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Preview full sync (all customers, read-only)
              </Button>
              <Button type="button" variant="ghost" onClick={disconnectNow} disabled={pending}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {result && !result.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.message}
          </p>
        ) : null}
        {result && result.ok ? (
          <div className="space-y-1.5 rounded-lg border border-[var(--color-border)] p-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.customers.length} real customer{result.customers.length === 1 ? "" : "s"} retrieved from Homeworks:
            </p>
            <ul className="space-y-1 text-xs text-[var(--color-text-secondary)]">
              {result.customers.map((c) => (
                <li key={c.id}>
                  <span className="text-[var(--color-text-primary)]">{c.fullName || `${c.firstName} ${c.lastName}`}</span>
                  {c.properties.length > 0 ? ` — ${c.properties.length} propert${c.properties.length === 1 ? "y" : "ies"}` : ""}
                  {c.address?.city ? ` (${c.address.city}, ${c.address.state ?? ""})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview && !preview.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {preview.message}
          </p>
        ) : null}
        {preview && preview.ok ? (
          <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
            {preview.account ? (
              <p className="text-xs text-[var(--color-text-secondary)]">
                Authenticated as <span className="text-[var(--color-text-primary)]">{preview.account.userEmail}</span> at{" "}
                <span className="text-[var(--color-text-primary)]">{preview.account.companyName}</span>.
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {preview.totalHomeworksCustomers} real customer{preview.totalHomeworksCustomers === 1 ? "" : "s"} found in Homeworks
              {preview.hitPageCap ? " (stopped at the pagination safety cap — there may be more)" : ""}, across {preview.pageCount} page
              {preview.pageCount === 1 ? "" : "s"}. {preview.upcomingJobCount} job{preview.upcomingJobCount === 1 ? "" : "s"} scheduled in the next 7 days.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-lg font-semibold text-[var(--color-accent)]">{preview.wouldCreate}</div>
                <div className="text-[var(--color-text-muted)]">would create</div>
              </div>
              <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-lg font-semibold text-[var(--color-info)]">{preview.wouldUpdate}</div>
                <div className="text-[var(--color-text-muted)]">would update</div>
              </div>
              <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-lg font-semibold text-[var(--color-warning)]">{preview.possibleDuplicates}</div>
                <div className="text-[var(--color-text-muted)]">unlinked matches</div>
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Nothing has been written yet — everything above is a preview. Confirming below writes the create/update rows only;
              unlinked matches (same phone/email as an existing client with no Homeworks ID) are skipped here — use &quot;Link existing records&quot; below.
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--color-text-secondary)]">Show all {preview.rows.length} records</summary>
              <ul className="mt-1.5 max-h-64 space-y-1 overflow-y-auto text-[var(--color-text-secondary)]">
                {preview.rows.map((r) => (
                  <li key={r.homeworksId} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--color-text-primary)]">{r.name}</span>
                    <span
                      className={
                        r.action === "would_create"
                          ? "text-[var(--color-accent)]"
                          : r.action === "would_update"
                            ? "text-[var(--color-info)]"
                            : "text-[var(--color-warning)]"
                      }
                    >
                      {r.action === "would_create" ? "create" : r.action === "would_update" ? "update" : `unlinked match (${r.matchedOn}) — link below`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            {preview.wouldCreate + preview.wouldUpdate > 0 ? (
              <Button type="button" onClick={runImport} disabled={importPending} className="w-full justify-center">
                {importPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Confirm import — write {preview.wouldCreate + preview.wouldUpdate} record(s) to Jarvis
              </Button>
            ) : null}
          </div>
        ) : null}

        {importResult && !importResult.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Import failed: {importResult.message}
          </p>
        ) : null}
        {importResult && importResult.ok ? (
          <div className="space-y-1.5 rounded-lg border border-[var(--color-accent)]/40 p-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Import complete: {importResult.created} created, {importResult.updated} updated, {importResult.propertiesSynced} properties synced,{" "}
              {importResult.skippedDuplicates} duplicates skipped{importResult.errors > 0 ? `, ${importResult.errors} errors` : ""}.
            </p>
            {importResult.errors > 0 ? (
              <ul className="space-y-1 text-xs text-[var(--color-critical)]">
                {importResult.rows
                  .filter((r) => r.outcome === "error")
                  .map((r) => (
                    <li key={r.homeworksId}>
                      {r.name}: {r.detail}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {connected ? (
          <HomeworksLinkPanel
            onLinked={() => {
              runPreview();
              runJobPreview();
              router.refresh();
            }}
          />
        ) : null}

        {connected ? <HomeworksReconcilePanel /> : null}

        {connected ? (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">Scheduled jobs</p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(["7", "14", "30", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setRangeMode(m);
                    setJobPreview(null);
                    setJobImportResult(null);
                  }}
                  className={`rounded-md border px-2 py-1 ${rangeMode === m ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)]"}`}
                >
                  {m === "custom" ? "Custom" : `Next ${m} days`}
                </button>
              ))}
              {rangeMode === "custom" ? (
                <>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Start date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
                  <span className="text-[var(--color-text-muted)]">to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="End date" className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-text-primary)]" />
                </>
              ) : null}
            </div>
            {!rangeCheck.ok ? <p className="text-[11px] text-[var(--color-critical)]">{rangeCheck.message}</p> : null}
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Jobs can only sync for a property that&apos;s already been imported above — sync customers/properties first.
            </p>
            <Button type="button" variant="secondary" onClick={runJobPreview} disabled={jobPreviewPending || !rangeCheck.ok}>
              {jobPreviewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Preview job sync (read-only)
            </Button>

            {jobPreview && !jobPreview.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {jobPreview.message}
              </p>
            ) : null}
            {jobPreview && jobPreview.ok ? (
              <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {jobPreview.stats.eventsRetrieved} Homeworks event{jobPreview.stats.eventsRetrieved === 1 ? "" : "s"} retrieved for {jobPreview.stats.range.from} to{" "}
                  {jobPreview.stats.range.to} (America/New_York, inclusive) in {jobPreview.stats.pages} page{jobPreview.stats.pages === 1 ? "" : "s"} of up to{" "}
                  {jobPreview.stats.pageSize}; {jobPreview.stats.duplicatesDropped} duplicate{jobPreview.stats.duplicatesDropped === 1 ? "" : "s"} dropped;{" "}
                  {jobPreview.stats.excludedNotOpen} not OPEN (not synced); {jobPreview.totalUpcomingJobs} scheduled job{jobPreview.totalUpcomingJobs === 1 ? "" : "s"} considered.
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                    <div className="text-lg font-semibold text-[var(--color-accent)]">{jobPreview.wouldCreate}</div>
                    <div className="text-[var(--color-text-muted)]">would create</div>
                  </div>
                  <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                    <div className="text-lg font-semibold text-[var(--color-info)]">{jobPreview.wouldUpdate}</div>
                    <div className="text-[var(--color-text-muted)]">would update</div>
                  </div>
                  <div className="rounded-md bg-[var(--color-surface-2)] p-2">
                    <div className="text-lg font-semibold text-[var(--color-warning)]">{jobPreview.blockedNoProperty}</div>
                    <div className="text-[var(--color-text-muted)]">property not synced</div>
                  </div>
                </div>
                {jobPreview.wouldCreate + jobPreview.wouldUpdate > 0 ? (
                  <Button type="button" onClick={runJobImport} disabled={jobImportPending} className="w-full justify-center">
                    {jobImportPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Confirm import — write {jobPreview.wouldCreate + jobPreview.wouldUpdate} job(s) to Jarvis
                  </Button>
                ) : null}
              </div>
            ) : null}

            {jobImportResult && !jobImportResult.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Job import failed: {jobImportResult.message}
              </p>
            ) : null}
            {jobImportResult && jobImportResult.ok ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Job import complete: {jobImportResult.created} created, {jobImportResult.updated} updated, {jobImportResult.blocked} blocked
                {jobImportResult.errors > 0 ? `, ${jobImportResult.errors} errors` : ""}.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
