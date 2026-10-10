import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { getIntegrationCards, type IntegrationStatus } from "@/lib/data/integrations";
import { getConnectionStatus } from "@/lib/integrations/homeworks-connection";
import { getConnectionStatus as getQuickBooksConnectionStatus } from "@/lib/integrations/quickbooks-connection";
import { getConnectionStatus as getGoogleCalendarConnectionStatus } from "@/lib/integrations/google-calendar-connection";
import { isHomeworksOAuthConfigured, isIntegrationConfigured } from "@/lib/env.server";
import { HomeworksConnectionCard } from "@/components/settings/homeworks-connection-card";
import { QuickBooksConnectionCard } from "@/components/settings/quickbooks-connection-card";
import { GoogleCalendarConnectionCard } from "@/components/settings/google-calendar-connection-card";
import { ArrowUpRight, CheckCircle2, CircleDashed, CloudSun, Database, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const statusMeta: Record<IntegrationStatus, { label: string; tone: BadgeTone }> = {
  unverified: { label: "Ready to test", tone: "neutral" },
  connected: { label: "Verified live", tone: "accent" },
  needs_setup: { label: "Setup needed", tone: "warning" },
  not_connected: { label: "Not connected", tone: "neutral" },
};

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<{ homeworks?: string; homeworks_message?: string; quickbooks?: string; quickbooks_message?: string; gcal?: string; gcal_message?: string }>;
}) {
  const [cards, homeworksConnection, quickbooksConnection, googleCalendarConnection, params] = await Promise.all([
    getIntegrationCards(), getConnectionStatus(), getQuickBooksConnectionStatus(), getGoogleCalendarConnectionStatus(), searchParams,
  ]);
  const serviceCards = cards.filter(card => ["supabase", "weather", "aiProvider"].includes(card.key));
  const homeworksMessage = params.homeworks === "connected" || params.homeworks === "error" ? { status: params.homeworks, message: params.homeworks_message } as const : null;
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">Workspace / Settings</p>
          <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">Connections</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">Your business, in one place. Check live access, reconnect an account, or see exactly what still needs setup.</p>
        </div>
        <Link href="/ai-advisor" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 text-sm font-medium hover:bg-[var(--color-surface-3)]"><Sparkles className="h-4 w-4 text-[var(--color-accent)]" />Ask Jarvis<ArrowUpRight className="h-4 w-4" /></Link>
      </div>

      <section aria-labelledby="services-heading">
        <h2 id="services-heading" className="mb-3 text-sm font-semibold">Workspace services</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {serviceCards.map(card => {
            const meta = statusMeta[card.status];
            const Icon = card.key === "supabase" ? Database : card.key === "weather" ? CloudSun : Sparkles;
            return <Card key={card.key}><CardBody className="space-y-4">
              <div className="flex items-center justify-between gap-3"><span className="rounded-xl bg-[var(--color-surface-3)] p-2.5"><Icon className="h-5 w-5 text-[var(--color-text-secondary)]" /></span><Badge tone={meta.tone}>{card.status === "connected" ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}{meta.label}</Badge></div>
              <div><h3 className="font-semibold">{card.key === "supabase" ? "Jarvis database" : card.key === "aiProvider" ? "Jarvis AI" : card.name}</h3><p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">{card.statusDetail}</p></div>
              {card.key === "aiProvider" && <Link href="/ai-advisor" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--color-accent)]">Test with a question<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
            </CardBody></Card>;
          })}
        </div>
      </section>

      <section aria-labelledby="business-accounts-heading" className="space-y-4">
        <div><h2 id="business-accounts-heading" className="text-sm font-semibold">Business accounts</h2><p className="mt-1 text-xs text-[var(--color-text-muted)]">Saved authorization and a successful live read are shown separately.</p></div>
        <Card><CardBody className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-start gap-4"><span className="rounded-xl bg-[var(--color-accent-soft)] p-3 text-[var(--color-accent)]"><RefreshCw className="h-5 w-5" /></span><div><h3 className="font-semibold">Homeworks</h3><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Customers, jobs, schedules and billing.</p><p className="mt-2 text-xs text-[var(--color-text-muted)]">Automatic updates every 5 minutes. See the freshness check above for the latest verified checkpoint.</p></div></div>
          <Link href="/homeworks" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--color-surface-3)] px-4 text-sm font-medium">View sync activity<ArrowUpRight className="h-4 w-4" /></Link>
        </CardBody></Card>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <QuickBooksConnectionCard connected={quickbooksConnection.connected}
            connectedAt={quickbooksConnection.connected ? quickbooksConnection.connectedAt : null}
            statusError={!quickbooksConnection.connected ? quickbooksConnection.error : null}
            realmId={quickbooksConnection.connected ? quickbooksConnection.realmId : null}
            statusCheckedAt={new Date().toISOString()}
            refreshExpiresAt={quickbooksConnection.connected ? quickbooksConnection.refreshExpiresAt : null}
            configured={isIntegrationConfigured("quickbooks")}
            urlMessage={params.quickbooks === "connected" || params.quickbooks === "error" ? { status: params.quickbooks, message: params.quickbooks_message } : null} />
          <GoogleCalendarConnectionCard connected={googleCalendarConnection.connected}
            connectedAt={googleCalendarConnection.connected ? googleCalendarConnection.connectedAt : null}
            statusError={!googleCalendarConnection.connected ? googleCalendarConnection.error : null}
            selectedCalendarId={googleCalendarConnection.connected ? googleCalendarConnection.selectedCalendarId : null}
            selectedCalendarSummary={googleCalendarConnection.connected ? googleCalendarConnection.selectedCalendarSummary : null}
            configured={isIntegrationConfigured("googleCalendar")}
            urlMessage={params.gcal === "connected" || params.gcal === "error" ? { status: params.gcal, message: params.gcal_message } : null} />
        </div>
      </section>

      <details open={params.homeworks === "error" || params.homeworks === "connected" || (!homeworksConnection.connected && !!homeworksConnection.error)} className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <summary className="cursor-pointer px-5 py-5 text-sm font-medium">Homeworks connection &amp; reconciliation</summary>
        <div className="border-t border-[var(--color-border)] p-4"><HomeworksConnectionCard connected={homeworksConnection.connected}
          connectedAt={homeworksConnection.connected ? homeworksConnection.connectedAt : null}
          statusError={!homeworksConnection.connected ? homeworksConnection.error : null}
          configured={isHomeworksOAuthConfigured()} urlMessage={homeworksMessage} /></div>
      </details>
      <p className="flex flex-wrap gap-4 text-xs text-[var(--color-accent)]"><Link href="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4">How Jarvis uses your data</Link><Link href="/terms" className="inline-flex min-h-11 items-center underline underline-offset-4">Terms of use</Link></p>
      <div className="flex items-start gap-3 text-xs leading-5 text-[var(--color-text-muted)]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>QuickBooks and Calendar previews are read-only. Homeworks remains the source for scheduled jobs and business records.</p></div>
    </div>
  );
}
