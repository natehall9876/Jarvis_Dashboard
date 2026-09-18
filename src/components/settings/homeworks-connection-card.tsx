"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { verifyHomeworksConnection, disconnectHomeworksAction, type VerifyResult } from "@/lib/actions/homeworks-oauth";
import { previewHomeworksSync, type SyncPreviewResult } from "@/lib/actions/homeworks-sync-preview";

/**
 * A "Connected" badge is not evidence (per explicit instruction) — this
 * card's real point is the Verify button, which actually calls the live
 * Homeworks GraphQL API for a handful of real customers and shows exactly
 * what came back, so "connected" means something checkable, not asserted.
 * "Preview Full Sync" goes further: paginates through every accessible
 * customer and compares against what's already in Jarvis — still entirely
 * read-only, no import button exists yet (that's the deliberate next step,
 * gated on the owner reviewing real counts first).
 */
export function HomeworksConnectionCard({
  connected,
  connectedAt,
  configured,
  urlMessage,
}: {
  connected: boolean;
  connectedAt: string | null;
  configured: boolean;
  urlMessage: { status: "connected" | "error"; message?: string } | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [preview, setPreview] = useState<SyncPreviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewPending, startPreviewTransition] = useTransition();

  function verify() {
    setResult(null);
    setPreview(null);
    startTransition(async () => {
      setResult(await verifyHomeworksConnection());
    });
  }

  function runPreview() {
    setPreview(null);
    startPreviewTransition(async () => {
      setPreview(await previewHomeworksSync());
    });
  }

  function disconnectNow() {
    startTransition(async () => {
      await disconnectHomeworksAction();
      setResult(null);
      setPreview(null);
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
            <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {preview.totalHomeworksCustomers} real customer{preview.totalHomeworksCustomers === 1 ? "" : "s"} found in Homeworks
              {preview.hitPageCap ? " (stopped at the pagination safety cap — there may be more)" : ""}, across {preview.pageCount} page
              {preview.pageCount === 1 ? "" : "s"}.
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
                <div className="text-[var(--color-text-muted)]">possible duplicates</div>
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Nothing has been written — this is a preview only. No import button exists yet; that comes after you&apos;ve reviewed these real numbers.
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
                      {r.action === "would_create" ? "create" : r.action === "would_update" ? "update" : `possible dup (${r.matchedOn})`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
