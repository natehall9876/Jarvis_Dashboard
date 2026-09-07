import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { getIntegrationCards, type IntegrationStatus } from "@/lib/data/integrations";
import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const statusMeta: Record<IntegrationStatus, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  connected: { label: "Connected", tone: "accent", icon: <CheckCircle2 className="h-3 w-3" /> },
  needs_setup: { label: "Needs Setup", tone: "warning", icon: <TriangleAlert className="h-3 w-3" /> },
  not_connected: { label: "Not Connected", tone: "neutral", icon: <CircleDashed className="h-3 w-3" /> },
};

export default async function SettingsPage() {
  const cards = await getIntegrationCards();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings / Integrations"
        description="Connection status for every system Jarvis can talk to. Nothing here is marked Connected unless it's been verified."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const meta = statusMeta[card.status];
          return (
            <Card key={card.key}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{card.name}</h3>
                  <Badge tone={meta.tone}>
                    {meta.icon}
                    {meta.label}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">{card.description}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{card.statusDetail}</p>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardBody className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p className="font-medium text-[var(--color-text-primary)]">Environment variables</p>
          <p>
            Copy <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-xs">.env.local.example</code> to{" "}
            <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-xs">.env.local</code> and fill in the values
            for whichever integrations you&apos;re ready to connect. Supabase is required for the app to show any data; the rest are
            optional and only unlock their respective card once configured and, for OAuth-based integrations, once a real
            connection flow is built.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
