import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { getIntegrationCards, type IntegrationStatus } from "@/lib/data/integrations";
import { getConnectionStatus } from "@/lib/integrations/homeworks-connection";
import { isHomeworksOAuthConfigured } from "@/lib/env";
import { HomeworksConnectionCard } from "@/components/settings/homeworks-connection-card";
import { CheckCircle2, CircleDashed, TriangleAlert, Upload } from "lucide-react";

export const dynamic = "force-dynamic";

const statusMeta: Record<IntegrationStatus, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  connected: { label: "Connected", tone: "accent", icon: <CheckCircle2 className="h-3 w-3" /> },
  needs_setup: { label: "Needs Setup", tone: "warning", icon: <TriangleAlert className="h-3 w-3" /> },
  not_connected: { label: "Not Connected", tone: "neutral", icon: <CircleDashed className="h-3 w-3" /> },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ homeworks?: string; homeworks_message?: string }>;
}) {
  const [cards, homeworksConnection, { homeworks: homeworksStatus, homeworks_message: homeworksMessage }] = await Promise.all([
    getIntegrationCards(),
    getConnectionStatus(),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings / Integrations"
        description="Connection status for every system Jarvis can talk to. Nothing here is marked Connected unless it's been verified."
      />

      <HomeworksConnectionCard
        connected={homeworksConnection.connected}
        connectedAt={homeworksConnection.connected ? homeworksConnection.connectedAt : null}
        statusError={!homeworksConnection.connected ? homeworksConnection.error : null}
        configured={isHomeworksOAuthConfigured()}
        urlMessage={homeworksStatus === "connected" || homeworksStatus === "error" ? { status: homeworksStatus, message: homeworksMessage } : null}
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
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Homeworks customer import</p>
            <p className="text-xs text-[var(--color-text-secondary)]">Review and safely import Homeworks records — preview before anything is written.</p>
          </div>
          <Link
            href="/settings/homeworks-import"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-surface-3)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-raised)]"
          >
            <Upload className="h-4 w-4" />
            Open Import Tool
          </Link>
        </CardBody>
      </Card>

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
