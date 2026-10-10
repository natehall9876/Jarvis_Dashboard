"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { HomeworksManagedNotice } from "@/components/homeworks-managed-notice";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { verifyHomeworksConnection, disconnectHomeworksAction, type VerifyResult } from "@/lib/actions/homeworks-oauth";
import { HomeworksReconcilePanel } from "@/components/settings/homeworks-reconcile-panel";
import { HomeworksSyncStatusPanel } from "@/components/settings/homeworks-sync-status-panel";

/** Connection verification and read-only diagnostics for automatic synchronization. */
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
  const [pending, startTransition] = useTransition();
  function verify() {
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await verifyHomeworksConnection());
      } catch {
        setResult({ ok: false, message: "Homeworks customers could not be loaded. Check the connection and try Verify again." });
      }
    });
  }

  function disconnectNow() {
    setResult(null);
    startTransition(async () => {
      try {
        const disconnected = await disconnectHomeworksAction();
        if (!disconnected.ok) { setResult(disconnected); return; }
        router.refresh();
      } catch {
        setResult({ ok: false, message: "Disconnect could not be confirmed. Reload Settings to check the saved authorization before trying again." });
      }
    });
  }

  return (
    <Card>
      <CardHeader
        title="Homeworks (real API)"
        description="Connect Homeworks for automatic synchronization and verify the connection."
      />
      <CardBody className="space-y-3">
        {urlMessage?.status === "error" ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {urlMessage.message ?? "The connection attempt failed."}
          </p>
        ) : null}
        {urlMessage?.status === "connected" && connected ? (
          <p role="status" className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Authorization saved - click Verify below to confirm real data comes back.
          </p>
        ) : null}
        {statusError ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
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
        ) : statusError ? null : !connected ? (
          <a
            href="/api/integrations/homeworks/oauth/connect"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
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
              <Button type="button" variant="ghost" onClick={disconnectNow} disabled={pending}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {result && !result.ok ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {result.message}
          </p>
        ) : null}
        {result && result.ok ? (
          <div role="status" className="space-y-1.5 rounded-lg border border-[var(--color-border)] p-2">
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

        <HomeworksManagedNotice>
          Automatic synchronization maintains Homeworks records. Make customer, property, service and billing changes in Homeworks.
        </HomeworksManagedNotice>
        {connected ? <HomeworksReconcilePanel /> : null}
        {connected ? <HomeworksSyncStatusPanel connectedAt={connectedAt} /> : null}
      </CardBody>
    </Card>
  );
}
