"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getHomeworksSyncStatus, type SyncStatusResult } from "@/lib/actions/homeworks-sync-status";

function when(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}

/**
 * What has actually synced, derived from real counts and the real activity
 * log — not "Connected" based only on a stored token. See homeworks-sync-
 * status.ts for exactly what each number counts.
 */
export function HomeworksSyncStatusPanel({ connectedAt }: { connectedAt: string | null }) {
  const [result, setResult] = useState<SyncStatusResult | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => setResult(await getHomeworksSyncStatus()));
  }

  const s = result && result.ok ? result.status : null;

  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--color-text-primary)]">Sync status</p>
        <Button type="button" variant="secondary" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check sync status
        </Button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)]">Token stored since {connectedAt ? when(connectedAt) : "never — not connected"}. That alone doesn&apos;t mean anything has synced.</p>

      {result && !result.ok ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.message}
        </p>
      ) : null}

      {s ? (
        <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-2 text-xs">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-[var(--color-surface-2)] p-2">
              <div className="text-base font-semibold text-[var(--color-text-primary)]">
                {s.clientsLinked}/{s.clientsTotal}
              </div>
              <div className="text-[var(--color-text-muted)]">Clients linked</div>
            </div>
            <div className="rounded-md bg-[var(--color-surface-2)] p-2">
              <div className="text-base font-semibold text-[var(--color-text-primary)]">
                {s.propertiesLinked}/{s.propertiesTotal}
              </div>
              <div className="text-[var(--color-text-muted)]">Properties linked</div>
            </div>
            <div className="rounded-md bg-[var(--color-surface-2)] p-2">
              <div className="text-base font-semibold text-[var(--color-text-primary)]">
                {s.jobsLinked}/{s.jobsTotal}
              </div>
              <div className="text-[var(--color-text-muted)]">Jobs linked</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1 text-[var(--color-text-secondary)] sm:grid-cols-3">
            <div>
              Last live webhook delivery: <span className="text-[var(--color-text-primary)]">{when(s.lastWebhookDeliveryAt)}</span>
            </div>
            <div>
              Last bulk import: <span className="text-[var(--color-text-primary)]">{when(s.lastBulkImportAt)}</span>
            </div>
            <div>
              Last customer/property link: <span className="text-[var(--color-text-primary)]">{when(s.lastLinkedAt)}</span>
            </div>
            <div>
              Last job enrichment: <span className="text-[var(--color-text-primary)]">{when(s.lastEnrichedAt)}</span>
            </div>
            <div>
              Last history backfill: <span className="text-[var(--color-text-primary)]">{when(s.lastHistoricalSyncAt)}</span>
            </div>
          </div>
          {!s.lastWebhookDeliveryAt ? (
            <p className="flex items-start gap-1.5 text-[var(--color-warning)]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No live webhook delivery has ever been recorded. If the Zapier Zap is supposed to be running, check its History tab in Zapier directly — a linked/total count above being non-zero only means SOME sync path (webhook, bulk import, or manual link) has run at some point, not that the live webhook specifically is delivering right now.
            </p>
          ) : null}
          {s.recentActivity.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-[var(--color-text-muted)]">Recent sync activity ({s.recentActivity.length})</summary>
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-[var(--color-text-muted)]">
                {s.recentActivity.map((a) => (
                  <li key={a.id}>
                    {when(a.createdAt)} — {a.summary}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-[var(--color-text-muted)]">No sync activity recorded yet.</p>
          )}
          {s.recentFailures.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-[var(--color-warning)]">Recent sync failures ({s.recentFailures.length})</summary>
              <ul className="mt-1 max-h-40 space-y-1.5 overflow-y-auto text-[var(--color-text-muted)]">
                {s.recentFailures.map((f) => (
                  <li key={f.id}>
                    {when(f.createdAt)} — <span className="uppercase tracking-wide">{f.origin === "webhook" ? "webhook" : "bulk import"}</span>
                    {f.entityType ? ` (${f.entityType}${f.homeworksId ? ` ${f.homeworksId}` : ""})` : ""}: {f.errorMessage}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="text-[var(--color-text-muted)]">No sync failures recorded.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
