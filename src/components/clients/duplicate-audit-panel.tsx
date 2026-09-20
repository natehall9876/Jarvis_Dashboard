"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findDuplicateClients, type DuplicateAuditResult } from "@/lib/actions/client-duplicate-audit";

/**
 * Read-only, owner-triggered audit — never merges or deletes anything.
 * Built specifically so a real duplicate-creation bug (found 2026-09-20: a
 * stale/mismatched homeworks_id on an existing client wrongly exempted it
 * from the Homeworks import's duplicate check, now fixed for future
 * imports) has a way to be found and manually reconciled, since the fix
 * itself doesn't retroactively clean up whatever it already created.
 */
export function DuplicateAuditPanel() {
  const [result, setResult] = useState<DuplicateAuditResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await findDuplicateClients());
    });
  }

  return (
    <details className="rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
        <ChevronDown className="h-3.5 w-3.5" />
        Check for duplicate client records
      </summary>
      <div className="mt-2 space-y-2">
        <Button type="button" variant="secondary" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Run audit (read-only — checks phone/email matches across all clients)
        </Button>
        {result && !result.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.message}
          </p>
        ) : null}
        {result && result.ok && result.clusters.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No matching phone/email across {result.totalClientsChecked} clients — no likely duplicates found.
          </p>
        ) : null}
        {result && result.ok && result.clusters.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-warning)]">
              {result.clusters.length} possible duplicate group{result.clusters.length === 1 ? "" : "s"} found — nothing has been changed;
              review each and decide manually (edit or archive one, or leave both if they&apos;re genuinely different people).
            </p>
            {result.clusters.map((cluster, i) => (
              <div key={i} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                <p className="mb-1 text-[var(--color-text-muted)]">
                  Matching {cluster.matchedOn}: <span className="text-[var(--color-text-secondary)]">{cluster.matchedValue}</span>
                </p>
                <ul className="space-y-1">
                  {cluster.clients.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <Link href={`/clients/${c.id}`} className="text-[var(--color-accent)] hover:underline">
                        {c.name}
                      </Link>
                      <span className="text-[var(--color-text-muted)]">
                        {c.dataSource}
                        {c.homeworksId ? ` · homeworks_id ${c.homeworksId}` : " · no homeworks_id"} · added {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
