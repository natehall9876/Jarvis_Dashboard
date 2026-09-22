"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert, Unplug } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyQuickBooksConnection, previewQuickBooksFinancials, disconnectQuickBooksAction, type PreviewQuickBooksResult, type VerifyQuickBooksResult } from "@/lib/actions/quickbooks";

/**
 * Mirrors HomeworksConnectionCard's pattern: a "Connected" badge means only
 * that a token is stored — Verify makes one real, cheap QuickBooks call
 * (CompanyInfo) to prove it actually works, before anything is claimed.
 * "Preview financial summary" fetches customers/invoices/payments read-only
 * and reduces them to figures each sourced from exactly one QuickBooks
 * entity type (see quickbooks-summary.ts) — nothing here writes, and
 * nothing here matches a QuickBooks customer to a Jarvis client.
 */
export function QuickBooksConnectionCard({
  connected,
  connectedAt,
  realmId,
  configured,
  urlMessage,
}: {
  connected: boolean;
  connectedAt: string | null;
  realmId: string | null;
  configured: boolean;
  urlMessage: { status: "connected" | "error"; message?: string } | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<VerifyQuickBooksResult | null>(null);
  const [preview, setPreview] = useState<PreviewQuickBooksResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewPending, startPreviewTransition] = useTransition();

  function verify() {
    setResult(null);
    startTransition(async () => setResult(await verifyQuickBooksConnection()));
  }
  function runPreview() {
    setPreview(null);
    startPreviewTransition(async () => setPreview(await previewQuickBooksFinancials()));
  }
  function disconnectNow() {
    startTransition(async () => {
      await disconnectQuickBooksAction();
      setResult(null);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="QuickBooks"
        description="Accounting: read-only access to customers, invoices, and payments. Jarvis never writes to QuickBooks."
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
            Not configured — <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">QUICKBOOKS_CLIENT_ID</code> and{" "}
            <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">QUICKBOOKS_CLIENT_SECRET</code> are missing. Register an app at{" "}
            <span className="text-[var(--color-text-secondary)]">developer.intuit.com</span> with redirect URI{" "}
            <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5">/api/integrations/quickbooks/oauth/callback</code>.
          </p>
        ) : !connected ? (
          <a
            href="/api/integrations/quickbooks/oauth/connect"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
          >
            Connect QuickBooks
          </a>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Company {realmId ?? "unknown"} — token on file since {connectedAt ? new Date(connectedAt).toLocaleString() : "unknown"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={verify} disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Verify — fetch company info
              </Button>
              <Button type="button" variant="secondary" onClick={runPreview} disabled={previewPending}>
                {previewPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Preview financial summary (read-only)
              </Button>
              <Button type="button" variant="ghost" onClick={disconnectNow} disabled={pending}>
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {result ? (
          <p className={`flex items-start gap-1.5 text-xs ${result.ok ? "text-[var(--color-accent)]" : "text-[var(--color-critical)]"}`}>
            {result.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {result.ok ? `Verified — connected to "${result.companyName}".` : result.message}
          </p>
        ) : null}

        {preview && !preview.ok ? (
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {preview.message}
          </p>
        ) : null}
        {preview && preview.ok ? (
          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {[
              ["Customers", preview.summary.customerCount],
              ["Total invoiced", `$${preview.summary.totalInvoiced.toLocaleString()}`],
              ["Outstanding", `$${preview.summary.totalOutstanding.toLocaleString()}`],
              ["Overdue", `${preview.summary.overdueInvoiceCount} ($${preview.summary.overdueAmount.toLocaleString()})`],
              ["Payments recorded", preview.summary.paymentCount],
              ["Total collected", `$${preview.summary.totalCollected.toLocaleString()}`],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-md bg-[var(--color-surface-2)] p-2">
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{value}</div>
                <div className="text-[var(--color-text-muted)]">{label as string}</div>
              </div>
            ))}
          </div>
        ) : null}
        {preview && preview.ok ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            &ldquo;Total collected&rdquo; comes from QuickBooks Payment records (real cash received), not from invoice balances — the two are tracked separately in
            QuickBooks and are never summed together here. These figures are not yet matched to Jarvis customers or jobs.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
